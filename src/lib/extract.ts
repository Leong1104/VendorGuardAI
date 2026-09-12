import "server-only";

import { Type } from "@google/genai";

import { classifyAndExtractLocal } from "@/lib/extract-local";
import { generateWithFallback } from "@/lib/gemini";
import type { ExtractedFields } from "@/lib/fields";
import { getAiProvider } from "@/lib/provider";

// Re-exported so existing imports keep working.
export {
  normalizeExtracted,
  redactExtracted,
  type ExtractedFields,
  type NormalizedFields,
} from "@/lib/fields";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    doc_type: {
      type: Type.STRING,
      enum: [
        "supplier_profile",
        "purchase_order",
        "invoice",
        "delivery_order",
        "payment_receipt",
        "unknown",
      ],
    },
    confidence: { type: Type.NUMBER },
    supplier_name: { type: Type.STRING, nullable: true },
    supplier_registration_number: { type: Type.STRING, nullable: true },
    buyer_name: { type: Type.STRING, nullable: true },
    bank_account_number: { type: Type.STRING, nullable: true },
    invoice_number: { type: Type.STRING, nullable: true },
    po_number: { type: Type.STRING, nullable: true },
    delivery_order_number: { type: Type.STRING, nullable: true },
    receipt_number: { type: Type.STRING, nullable: true },
    issue_date: { type: Type.STRING, nullable: true },
    due_date: { type: Type.STRING, nullable: true },
    delivery_date: { type: Type.STRING, nullable: true },
    payment_date: { type: Type.STRING, nullable: true },
    currency: { type: Type.STRING, nullable: true },
    total_amount: { type: Type.STRING, nullable: true },
    payment_status: { type: Type.STRING, nullable: true },
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit_price: { type: Type.STRING },
        },
        required: ["description", "quantity", "unit_price"],
      },
    },
  },
  required: ["doc_type", "confidence", "line_items"],
} as const;

const PROMPT = `You are a document classifier and field extractor for an accounts-payable system.

Classify this PDF as one of: supplier_profile, purchase_order, invoice, delivery_order, payment_receipt, or unknown, with a confidence between 0 and 1.

Then extract the fields EXACTLY as printed in the document — do not reformat dates, amounts, or references. Use null for any field the document does not contain. Do not guess or infer values from context; a missing PO reference must be null even if other clues suggest one.

Field notes:
- supplier_name: the vendor/seller company (not the buyer).
- bank_account_number: any bank account number shown for payment or in the supplier's banking details.
- payment_status: any printed status like UNPAID, PAID, SETTLED.
- total_amount: the grand total, as printed (e.g. "RM 11,188.80").`;

/**
 * Classify one PDF and extract its fields, as printed. Routes to Gemini or
 * the local text-layer parser depending on the configured provider.
 */
export async function classifyAndExtract(pdf: Buffer): Promise<ExtractedFields> {
  if (getAiProvider() === "local") return classifyAndExtractLocal(pdf);
  return classifyAndExtractGemini(pdf);
}

async function classifyAndExtractGemini(pdf: Buffer): Promise<ExtractedFields> {
  const { response } = await generateWithFallback({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Partial<ExtractedFields>;
  return {
    doc_type: parsed.doc_type ?? "unknown",
    confidence: parsed.confidence ?? 0,
    supplier_name: parsed.supplier_name ?? null,
    supplier_registration_number: parsed.supplier_registration_number ?? null,
    buyer_name: parsed.buyer_name ?? null,
    bank_account_number: parsed.bank_account_number ?? null,
    invoice_number: parsed.invoice_number ?? null,
    po_number: parsed.po_number ?? null,
    delivery_order_number: parsed.delivery_order_number ?? null,
    receipt_number: parsed.receipt_number ?? null,
    issue_date: parsed.issue_date ?? null,
    due_date: parsed.due_date ?? null,
    delivery_date: parsed.delivery_date ?? null,
    payment_date: parsed.payment_date ?? null,
    currency: parsed.currency ?? null,
    total_amount: parsed.total_amount ?? null,
    payment_status: parsed.payment_status ?? null,
    line_items: parsed.line_items ?? [],
  };
}

