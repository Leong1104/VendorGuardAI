// Field shapes shared by every extraction provider (Gemini or local parser)
// plus the deterministic normalization that turns raw printed values into
// canonical ones. Pure code, no server-only imports, so it also runs in
// scripts and (later) in the browser.

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

// Raw fields read off the PDF, as printed. Normalization to
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
