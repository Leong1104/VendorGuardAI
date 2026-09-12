import type { ExtractedFields } from "@/lib/fields";
import { extractPdfLines } from "@/lib/pdf-text";
import type { DocType } from "@/lib/types";

// Local (no-API) classification and field extraction over the PDF text
// layer. It is a label-driven parser: every field is read from a line of
// the form "Label: value", so results are fully reproducible and auditable.
// It handles the document vocabulary used by common Malaysian AP paperwork
// (invoice / PO / DO / receipt / supplier profile) — it is not a general
// document-understanding model, and unknown layouts yield null fields
// rather than guesses.

// ---------- classification ----------

const TITLE_RULES: [RegExp, DocType][] = [
  [/SUPPLIER.*(PROFILE|MASTER|REGISTRATION)|VENDOR.*(PROFILE|MASTER)/i, "supplier_profile"],
  [/PURCHASE\s+ORDER/i, "purchase_order"],
  [/DELIVERY\s+(ORDER|NOTE)/i, "delivery_order"],
  [/RECEIPT|PAYMENT\s+(ADVICE|CONFIRMATION)|REMITTANCE\s+ADVICE/i, "payment_receipt"],
  [/INVOICE/i, "invoice"],
];

// Labels that only appear in one document type; used when the title line
// is missing or ambiguous.
const BODY_RULES: [RegExp, DocType][] = [
  [/^(Receipt (Number|No\.?)|Amount Received|Credited Account)\b/im, "payment_receipt"],
  [/^(DO (Number|No\.?)|Delivery Order (Number|No\.?)|Delivered Items)\b/im, "delivery_order"],
  [/^(PO (Number|No\.?)|Purchase Order (Number|No\.?))\s*:/im, "purchase_order"],
  [/^Verified Banking Details|^Verification Status/im, "supplier_profile"],
  [/^(Invoice (Number|No\.?)|Total Due|Amount Payable)\s*:/im, "invoice"],
];

export function classifyLines(lines: string[]): { doc_type: DocType; confidence: number } {
  const title = lines[0] ?? "";
  for (const [pattern, doc_type] of TITLE_RULES) {
    if (pattern.test(title)) return { doc_type, confidence: 0.95 };
  }
  const text = lines.join("\n");
  for (const [pattern, doc_type] of BODY_RULES) {
    if (pattern.test(text)) return { doc_type, confidence: 0.7 };
  }
  return { doc_type: "unknown", confidence: 0 };
}

// ---------- field readers ----------

/** First "Label: value" line whose label matches; returns the trimmed value. */
function labelled(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const idx = line.search(/[:：]/);
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!label.test(key)) continue;
    const value = line.slice(idx + 1).trim();
    if (value) return value;
  }
  return null;
}

/** The line following a standalone heading (e.g. "Supplier" → company name). */
function afterHeading(lines: string[], heading: RegExp): string | null {
  for (let i = 0; i < lines.length - 1; i++) {
    if (heading.test(lines[i]) && !/[:：]/.test(lines[i])) {
      const next = lines[i + 1];
      if (next && !/[:：]/.test(next)) return next;
    }
  }
  return null;
}

/** "Label: 512233444321" → digits only; guards against phone/reg numbers by label. */
function accountNumber(lines: string[]): string | null {
  const raw = labelled(
    lines,
    /^(Bank\s+)?Account\s+(Number|No\.?)$|^Beneficiary\s+Account(\s+(Number|No\.?))?$|^Credited\s+Account$|^Account$/i
  );
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

const LINE_ITEM =
  /^(.+?)\s+[—–-]+\s+qty\.?\s*(\d+(?:\.\d+)?)\s*(?:x|@|at)?\s*((?:RM|MYR)?\s?[\d,]+\.\d{2})/i;

function lineItems(lines: string[]): ExtractedFields["line_items"] {
  const items: ExtractedFields["line_items"] = [];
  for (const line of lines) {
    const m = line.match(LINE_ITEM);
    if (!m) continue;
    items.push({
      description: m[1].trim(),
      quantity: Number.parseFloat(m[2]),
      unit_price: m[3].trim(),
    });
  }
  return items;
}

function supplierName(lines: string[], docType: DocType): string | null {
  return (
    labelled(lines, /^(Company|Supplier|Vendor|Seller)\s+Name$/i) ??
    labelled(lines, /^(Delivered|Issued|Supplied)\s+by$/i) ??
    afterHeading(lines, /^(Supplier|From|Vendor|Seller|Supplier\s+Details)$/i) ??
    (docType === "supplier_profile" ? labelled(lines, /^Account\s+Name$/i) : null)
  );
}

function buyerName(lines: string[]): string | null {
  return (
    labelled(lines, /^(Buyer|Customer|Client)\s+Name$/i) ??
    afterHeading(lines, /^(Buyer|Bill\s+To|Customer|Deliver\s+To|Received\s+From|Ship\s+To)$/i)
  );
}

function currency(lines: string[], amount: string | null): string | null {
  const explicit = labelled(lines, /^Currency$/i);
  if (explicit) return explicit;
  if (amount && /\b(RM|MYR)\b/i.test(amount)) return "MYR";
  return null;
}

// ---------- public API ----------

/** Pure parser over text lines; also used by the browser build later. */
export function extractFieldsFromLines(lines: string[]): ExtractedFields {
  const { doc_type, confidence } = classifyLines(lines);
  const total_amount = labelled(
    lines,
    /^(Grand\s+Total|Total\s+Due|Amount\s+Payable|Amount\s+Received|Total\s+Amount|Amount\s+Paid|Total)$/i
  );

  return {
    doc_type,
    confidence,
    supplier_name: supplierName(lines, doc_type),
    supplier_registration_number: labelled(
      lines,
      /^(Registration\s+(Number|No\.?)|Reg\.?\s*No\.?|SSM\s+(Number|No\.?)|Company\s+(Number|No\.?))$/i
    ),
    buyer_name: buyerName(lines),
    bank_account_number: accountNumber(lines),
    invoice_number: labelled(
      lines,
      /^(Invoice\s+(Number|No\.?|Ref\.?|Reference)|In\s+settlement\s+of\s+Invoice)$/i
    ),
    // Deliberately strict: a PO reference counts only when labelled as one.
    po_number: labelled(
      lines,
      /^(PO\s+(Number|No\.?|Ref\.?|Reference)|Purchase\s+Order\s+(Number|No\.?|Ref\.?|Reference))$/i
    ),
    delivery_order_number: labelled(
      lines,
      /^(DO\s+(Number|No\.?)|Delivery\s+Order\s+(Number|No\.?))$/i
    ),
    receipt_number: labelled(lines, /^(Receipt\s+(Number|No\.?)|Reference\s+(Number|No\.?))$/i),
    issue_date: labelled(
      lines,
      /^(Invoice\s+Date|Date\s+of\s+Issue|Issue\s+Date|PO\s+Date|Order\s+Date|Date)$/i
    ),
    due_date: labelled(lines, /^(Due\s+Date|Payment\s+Due|Due)$/i),
    delivery_date: labelled(lines, /^(Delivery\s+Date|Delivered\s+On)$/i),
    payment_date: labelled(lines, /^(Payment\s+Date|Paid\s+On|Transaction\s+Date)$/i),
    currency: currency(lines, total_amount),
    total_amount,
    payment_status: labelled(lines, /^(Payment\s+Status|Status)$/i),
    line_items: lineItems(lines),
  };
}

/** Classify one PDF and extract its fields without any external API. */
export async function classifyAndExtractLocal(pdf: Uint8Array): Promise<ExtractedFields> {
  const lines = await extractPdfLines(pdf);
  return extractFieldsFromLines(lines);
}
