import type { NormalizedFields } from "@/lib/fields";
import type { FindingEvidence, RiskLevel, RuleCode } from "@/lib/types";

// Deterministic control checks over normalized fields. This module is pure
// code — no AI — which is what makes the risk score explainable: identical
// inputs always produce identical findings, and every finding cites the
// exact documents and fields it was derived from.

export interface RuleDoc {
  id: string;
  file_name: string;
  file_hash: string;
  normalized: NormalizedFields;
}

export interface RuleFinding {
  rule_code: RuleCode;
  title: string;
  detail: string;
  points: number;
  evidence: FindingEvidence[];
}

export interface RuleResult {
  findings: RuleFinding[];
  risk_score: number; // capped at 100
  risk_level: RiskLevel;
}

const byType = (docs: RuleDoc[], type: string) =>
  docs.filter((d) => d.normalized.doc_type === type);

/** Rule 1 (+15): same invoice number and amount, different file hash/layout. */
function checkDuplicateInvoice(docs: RuleDoc[]): RuleFinding[] {
  const invoices = byType(docs, "invoice").filter(
    (d) => d.normalized.invoice_number
  );
  const groups = new Map<string, RuleDoc[]>();
  for (const doc of invoices) {
    const key = doc.normalized.invoice_number!;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }

  const findings: RuleFinding[] = [];
  for (const [invoiceNumber, group] of groups) {
    if (group.length < 2) continue;
    const distinctHashes = new Set(group.map((d) => d.file_hash));
    if (distinctHashes.size < 2) continue;
    findings.push({
      rule_code: "duplicate_invoice",
      title: "Duplicate invoice",
      detail: `${group.length} different PDF files use invoice number ${invoiceNumber} for the same supplier and amount. The files have different content hashes, so this is a reissued or duplicated invoice, not a re-upload of the same file.`,
      points: 15,
      evidence: group.map((d) => ({
        document_id: d.id,
        field: "file_hash",
        value: d.file_hash.slice(0, 16) + "…",
      })),
    });
  }
  return findings;
}

/** Rule 2 (+20): payment account differs from the supplier's verified account. */
function checkBankMismatch(docs: RuleDoc[]): RuleFinding[] {
  const profile = byType(docs, "supplier_profile").find(
    (d) => d.normalized.bank_account_last4
  );
  if (!profile) return [];
  const verified = profile.normalized.bank_account_last4!;

  const mismatched = docs.filter(
    (d) =>
      d.id !== profile.id &&
      d.normalized.bank_account_last4 &&
      d.normalized.bank_account_last4 !== verified
  );
  if (mismatched.length === 0) return [];

  return [
    {
      rule_code: "bank_mismatch",
      title: "Bank-account mismatch",
      detail: `The supplier's verified bank account ends in ${verified}, but ${mismatched.length} document(s) request or record payment to an account ending in ${mismatched[0].normalized.bank_account_last4}. Unverified beneficiary changes are a primary invoice-fraud indicator.`,
      points: 20,
      evidence: [
        {
          document_id: profile.id,
          field: "bank_account_masked",
          value: profile.normalized.bank_account_masked ?? "",
        },
        ...mismatched.map((d) => ({
          document_id: d.id,
          field: "bank_account_masked",
          value: d.normalized.bank_account_masked ?? "",
        })),
      ],
    },
  ];
}

/** Rule 3 (+15): invoices say UNPAID while a receipt says SETTLED. */
function checkStatusConflict(docs: RuleDoc[]): RuleFinding[] {
  const unpaidInvoices = byType(docs, "invoice").filter(
    (d) => d.normalized.payment_status === "UNPAID"
  );
  const settledReceipts = byType(docs, "payment_receipt").filter(
    (d) => d.normalized.payment_status === "SETTLED"
  );

  const conflicts = settledReceipts.flatMap((receipt) =>
    unpaidInvoices
      .filter(
        (inv) =>
          !receipt.normalized.invoice_number ||
          inv.normalized.invoice_number === receipt.normalized.invoice_number
      )
      .map((inv) => ({ receipt, inv }))
  );
  if (conflicts.length === 0) return [];

  const invoiceNumber = conflicts[0].inv.normalized.invoice_number ?? "the invoice";
  return [
    {
      rule_code: "status_conflict",
      title: "Payment-status conflict",
      detail: `Invoice ${invoiceNumber} is marked UNPAID on the invoice document(s), but receipt ${conflicts[0].receipt.normalized.receipt_number ?? ""} states the same invoice was already SETTLED. The records contradict each other, so a further payment could be a double payment.`,
      points: 15,
      evidence: [
        ...new Map(
          conflicts.flatMap(({ receipt, inv }) => [
            [
              inv.id,
              { document_id: inv.id, field: "payment_status", value: "UNPAID" },
            ],
            [
              receipt.id,
              { document_id: receipt.id, field: "payment_status", value: "SETTLED" },
            ],
          ])
        ).values(),
      ],
    },
  ];
}

/** Rule 4 (+10): invoices omit the PO although a PO exists in the batch. */
function checkMissingPoRef(docs: RuleDoc[]): RuleFinding[] {
  const po = byType(docs, "purchase_order").find((d) => d.normalized.po_number);
  if (!po) return [];
  const invoicesWithoutPo = byType(docs, "invoice").filter(
    (d) => !d.normalized.po_number
  );
  if (invoicesWithoutPo.length === 0) return [];

  return [
    {
      rule_code: "missing_po_ref",
      title: "Missing PO reference",
      detail: `Purchase order ${po.normalized.po_number} exists for this transaction, but ${invoicesWithoutPo.length} invoice(s) omit any PO reference. Invoices that bypass the PO chain evade three-way matching.`,
      points: 10,
      evidence: [
        {
          document_id: po.id,
          field: "po_number",
          value: po.normalized.po_number!,
        },
        ...invoicesWithoutPo.map((d) => ({
          document_id: d.id,
          field: "po_number",
          value: "(absent)",
        })),
      ],
    },
  ];
}

/** Rule 5 (+10): invoice past due and still unresolved at review time. */
function checkOverdue(docs: RuleDoc[], reviewDate: string): RuleFinding[] {
  const overdue = byType(docs, "invoice").filter(
    (d) =>
      d.normalized.due_date &&
      d.normalized.due_date < reviewDate &&
      d.normalized.payment_status !== "PAID" &&
      d.normalized.payment_status !== "SETTLED"
  );
  if (overdue.length === 0) return [];

  const dueDate = overdue[0].normalized.due_date!;
  const invoiceNumber = overdue[0].normalized.invoice_number ?? "Invoice";
  return [
    {
      rule_code: "overdue",
      title: "Overdue invoice",
      detail: `${invoiceNumber} was due on ${dueDate} and remains unresolved as of the review date (${reviewDate}). Aged unresolved invoices raise the pressure for rushed, unchecked payment.`,
      points: 10,
      evidence: overdue.map((d) => ({
        document_id: d.id,
        field: "due_date",
        value: d.normalized.due_date!,
      })),
    },
  ];
}

export function riskLevelFor(score: number): RiskLevel {
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/**
 * Run all control checks. `reviewDate` is ISO yyyy-mm-dd (defaults to today)
 * and only affects the overdue rule.
 */
export function runControlChecks(
  docs: RuleDoc[],
  reviewDate: string = new Date().toISOString().slice(0, 10)
): RuleResult {
  const findings = [
    ...checkDuplicateInvoice(docs),
    ...checkBankMismatch(docs),
    ...checkStatusConflict(docs),
    ...checkMissingPoRef(docs),
    ...checkOverdue(docs, reviewDate),
  ];
  const risk_score = Math.min(
    100,
    findings.reduce((sum, f) => sum + f.points, 0)
  );
  return { findings, risk_score, risk_level: riskLevelFor(risk_score) };
}
