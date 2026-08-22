import "server-only";

import { generateWithFallback } from "@/lib/gemini";
import type { RuleFinding } from "@/lib/rules";

// Step 7: Gemini narrates the deterministic findings in plain language.
// The model receives ONLY the rule-engine output and normalized summary —
// it cannot add, remove, or re-score risks, just explain them.

export interface ExplainInput {
  txn_code: string;
  supplier_name: string;
  supplier_code: string;
  invoice_number: string | null;
  po_number: string | null;
  currency: string;
  total_amount: number | null;
  verified_account_masked: string | null;
  requested_account_masked: string | null;
  risk_score: number;
  risk_level: string;
  findings: (RuleFinding & { source_files: string[] })[];
}

const SYSTEM = `You are the explanation writer for VendorGuard, an accounts-payable control system.

You will receive the output of a deterministic rule engine: a linked transaction summary and a list of control findings, each with points and the source documents it was derived from.

Write a concise explanation for a finance analyst:
- One short opening paragraph: what this transaction is and the overall risk verdict.
- One bullet per finding, in the given order, naming the source document file(s) each finding came from.
- One short closing paragraph with the recommended next actions.

Hard constraints:
- Do NOT invent findings, risks, amounts, or documents beyond the input.
- Do NOT change any numbers or the risk score.
- Bank accounts are already masked; reproduce them exactly as given.
- Plain text only, no markdown headers. Keep it under 220 words.`;

export async function generateExplanation(input: ExplainInput): Promise<string> {
  const { response } = await generateWithFallback({
    contents: [
      {
        role: "user",
        parts: [{ text: SYSTEM + "\n\nRule engine output:\n" + JSON.stringify(input, null, 2) }],
      },
    ],
    config: { temperature: 0.2 },
  });
  const text = response.text?.trim();
  if (!text) throw new Error("Empty explanation from model");
  return text;
}
