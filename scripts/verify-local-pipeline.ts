// End-to-end check of the no-API path: local text-layer extraction →
// deterministic normalization → rule engine, over samples/. Expected:
// 6 docs classified, SUP key resolved, 5 findings, 70/100 high.
//
//   npx tsx scripts/verify-local-pipeline.ts
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { classifyAndExtractLocal } from "../src/lib/extract-local";
import { buildExplanation } from "../src/lib/explain-local";
import { normalizeExtracted } from "../src/lib/fields";
import { runControlChecks, type RuleDoc } from "../src/lib/rules";

const EXPECTED: Record<string, Record<string, unknown>> = {
  "01_supplier_profile.pdf": {
    doc_type: "supplier_profile",
    supplier_key: "NEXA OFFICE SOLUTIONS",
    supplier_registration_number: "202101034567",
    bank_account_masked: "********4321",
  },
  "02_purchase_order.pdf": {
    doc_type: "purchase_order",
    po_number: "PO-2026-0108",
    issue_date: "2026-07-10",
    total_amount: 11188.8,
    currency: "MYR",
  },
  "03_invoice_original.pdf": {
    doc_type: "invoice",
    invoice_number: "INV-2026-0182",
    po_number: null,
    issue_date: "2026-07-16",
    due_date: "2026-08-15",
    payment_status: "UNPAID",
    bank_account_masked: "********6789",
    total_amount: 11188.8,
  },
  "04_invoice_reissued.pdf": {
    doc_type: "invoice",
    invoice_number: "INV-2026-0182",
    po_number: null,
    due_date: "2026-08-15",
    payment_status: "UNPAID",
    bank_account_masked: "********6789",
    total_amount: 11188.8,
  },
  "05_delivery_order.pdf": {
    doc_type: "delivery_order",
    delivery_order_number: "DO-2026-0097",
    po_number: "PO-2026-0108",
    invoice_number: "INV-2026-0182",
    delivery_date: "2026-07-18",
  },
  "06_payment_receipt.pdf": {
    doc_type: "payment_receipt",
    receipt_number: "PAY-2026-0255",
    invoice_number: "INV-2026-0182",
    payment_date: "2026-08-19",
    payment_status: "SETTLED",
    bank_account_masked: "********6789",
    total_amount: 11188.8,
  },
};

async function main() {
  const dir = join(process.cwd(), "samples");
  const docs: RuleDoc[] = [];
  let failures = 0;

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort()) {
    const bytes = readFileSync(join(dir, file));
    const extracted = await classifyAndExtractLocal(new Uint8Array(bytes));
    const normalized = normalizeExtracted(extracted);
    const actual = normalized as unknown as Record<string, unknown>;
    docs.push({
      id: file,
      file_name: file,
      file_hash: createHash("sha256").update(bytes).digest("hex"),
      normalized,
    });

    const expected = EXPECTED[file] ?? {};
    const mismatches = Object.entries(expected).filter(
      ([k, v]) => actual[k] !== v
    );
    failures += mismatches.length;
    console.log(
      `${mismatches.length ? "FAIL" : " ok "} ${file} → ${normalized.doc_type} (conf ${extracted.confidence}), ` +
        `${normalized.line_items.length} line items`
    );
    for (const [k, v] of mismatches) {
      console.log(`       ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual[k])}`);
    }
    if (process.argv.includes("--verbose")) console.log(normalized);
  }

  const result = runControlChecks(docs);
  console.log(`\nrules: ${result.findings.length} findings, ${result.risk_score}/100 ${result.risk_level}`);
  for (const f of result.findings) console.log(`  +${f.points} ${f.rule_code}: ${f.title}`);
  if (result.findings.length !== 5 || result.risk_score !== 70 || result.risk_level !== "high") {
    failures += 1;
    console.log("FAIL expected 5 findings, 70/100 high");
  }

  console.log("\n--- explanation (local template) ---\n");
  console.log(
    buildExplanation({
      txn_code: "TXN-2026-0108",
      supplier_name: "Nexa Office Solutions Sdn Bhd",
      supplier_code: "SUP-001",
      invoice_number: "INV-2026-0182",
      po_number: "PO-2026-0108",
      currency: "MYR",
      total_amount: 11188.8,
      verified_account_masked: "********4321",
      requested_account_masked: "********6789",
      risk_score: result.risk_score,
      risk_level: result.risk_level,
      findings: result.findings.map((f) => ({
        ...f,
        source_files: [...new Set(f.evidence.map((e) => e.document_id))],
      })),
    })
  );

  if (failures) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks passed");
}

main();
