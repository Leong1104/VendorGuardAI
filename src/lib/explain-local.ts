import type { ExplainInput } from "@/lib/explain";
import type { RuleCode } from "@/lib/types";

// Template narrator: renders the rule-engine output as the same three-part
// plain-text explanation the Gemini prompt asks for (overview, one bullet
// per finding citing source files, recommended actions). Fully
// deterministic — the same findings always produce the same text.

const NEXT_ACTION: Record<RuleCode, string> = {
  bank_mismatch:
    "verify the requested bank account out-of-band with a known supplier contact before any payment",
  duplicate_invoice:
    "confirm with the supplier which invoice copy is authoritative and void the other",
  status_conflict:
    "check the payment ledger to confirm whether this invoice has already been settled",
  missing_po_ref:
    "request corrected invoices that quote the purchase order number",
  overdue: "review why the invoice passed its due date without action",
};

const VERDICT: Record<string, string> = {
  high: "High risk — human verification is required before payment.",
  medium: "Medium risk — review the findings before approving.",
  low: "Low risk — no blocking control issues were found.",
  pending: "Risk assessment pending.",
};

function money(currency: string, amount: number | null): string {
  if (amount == null) return "an unspecified amount";
  return `${currency} ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

export function buildExplanation(input: ExplainInput): string {
  const refs = [
    input.invoice_number ? `invoice ${input.invoice_number}` : null,
    input.po_number ? `purchase order ${input.po_number}` : "no purchase order reference",
  ]
    .filter(Boolean)
    .join(" and ");

  const opening =
    `Transaction ${input.txn_code} is an accounts-payable request from ` +
    `${input.supplier_name} (${input.supplier_code}) under ${refs}, ` +
    `totaling ${money(input.currency, input.total_amount)}. ` +
    `Deterministic control checks produced ${input.findings.length} finding` +
    `${input.findings.length === 1 ? "" : "s"} for a risk score of ` +
    `${input.risk_score}/100. ${VERDICT[input.risk_level] ?? ""}`.trim();

  const bullets = input.findings.map((f) => {
    const sources = f.source_files.length
      ? ` Source: ${f.source_files.join(", ")}.`
      : "";
    return `- ${f.title} (+${f.points}): ${f.detail}${sources}`;
  });

  const actions = [...new Set(input.findings.map((f) => NEXT_ACTION[f.rule_code]))].filter(
    Boolean
  );
  const closing =
    input.findings.length === 0
      ? "Recommended next actions: none — the transaction may proceed through normal approval."
      : `Recommended next actions: ${
          input.risk_level === "high" ? "hold this payment; " : ""
        }${actions.join("; ")}.`;

  return [opening, bullets.join("\n"), closing].filter(Boolean).join("\n\n");
}
