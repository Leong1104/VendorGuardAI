import "server-only";

import { Type } from "@google/genai";

import { getGemini, GEMINI_MODEL } from "@/lib/gemini";
import {
  canonicalSupplierKey,
  maskBankAccount,
  normalizeAmount,
  normalizeCurrency,
  normalizeDate,
  normalizePaymentStatus,
  normalizeRef,
} from "@/lib/normalize";
import type { DocType } from "@/lib/types";

// Raw fields Gemini reads off the PDF, as printed. Normalization to
// canonical forms happens deterministically in code afterwards.
export interface ExtractedFields {
  doc_type: DocType;
  confidence: number;
  supplier_name: string | null;
  supplier_registration_number: string | null;
  buyer_name: string | null;
  bank_account_number: string | null;
  invoice_number: string | null;
  po_number: string | null;
  delivery_order_number: string | null;
  receipt_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  payment_date: string | null;
  currency: string | null;
  total_amount: string | null;
  payment_status: string | null;
  line_items: { description: string; quantity: number; unit_price: string }[];
}

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

/** Classify one PDF and extract its fields, as printed. */
export async function classifyAndExtract(pdf: Buffer): Promise<ExtractedFields> {
  const gemini = getGemini();
  const response = await gemini.models.generateContent({
    model: GEMINI_MODEL,
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

// Normalized form stored on documents.normalized. Bank accounts are masked
// here — the full number is never persisted (PDPA).
export interface NormalizedFields {
  doc_type: DocType;
  supplier_name: string | null;
  supplier_key: string | null;
  supplier_registration_number: string | null;
  bank_account_masked: string | null;
  bank_account_last4: string | null;
  invoice_number: string | null;
  po_number: string | null;
  delivery_order_number: string | null;
  receipt_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  payment_date: string | null;
  currency: string | null;
  total_amount: number | null;
  payment_status: string | null;
  line_items: { description: string; quantity: number; unit_price: number | null }[];
}

/** Deterministically normalize extracted fields; masks the bank account. */
export function normalizeExtracted(extracted: ExtractedFields): NormalizedFields {
  const account = maskBankAccount(extracted.bank_account_number);
  return {
    doc_type: extracted.doc_type,
    supplier_name: extracted.supplier_name?.trim() ?? null,
    supplier_key: canonicalSupplierKey(extracted.supplier_name),
    supplier_registration_number: normalizeRef(extracted.supplier_registration_number),
    bank_account_masked: account?.masked ?? null,
    bank_account_last4: account?.last4 ?? null,
    invoice_number: normalizeRef(extracted.invoice_number),
    po_number: normalizeRef(extracted.po_number),
    delivery_order_number: normalizeRef(extracted.delivery_order_number),
    receipt_number: normalizeRef(extracted.receipt_number),
    issue_date: normalizeDate(extracted.issue_date),
    due_date: normalizeDate(extracted.due_date),
    delivery_date: normalizeDate(extracted.delivery_date),
    payment_date: normalizeDate(extracted.payment_date),
    currency: normalizeCurrency(extracted.currency),
    total_amount: normalizeAmount(extracted.total_amount),
    payment_status: normalizePaymentStatus(extracted.payment_status),
    line_items: extracted.line_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: normalizeAmount(item.unit_price),
    })),
  };
}

/** PDPA: strip the raw bank account before the extraction is persisted. */
export function redactExtracted(extracted: ExtractedFields): ExtractedFields {
  const account = maskBankAccount(extracted.bank_account_number);
  return { ...extracted, bank_account_number: account?.masked ?? null };
}
