// The whole VendorGuard pipeline, running in the browser against the local
// IndexedDB store. Each function mirrors one of the former API routes and
// records the same audit events, so the transaction page's trail is
// unchanged. Nothing here calls the network.
//
//   createBatch   → POST /api/batches
//   processBatch  → POST /api/batches/[id]/process
//   linkBatch     → POST /api/batches/[id]/link
//   reviewAction  → POST /api/transactions/[id]/action
//   deleteBatch   → POST /api/batches/[id]/delete

import { audit, db } from "@/lib/db";
import { buildExplanation } from "@/lib/explain-local";
import { extractFieldsFromLines } from "@/lib/extract-local";
import { normalizeExtracted, redactExtracted, type NormalizedFields } from "@/lib/fields";
import { extractPdfLines } from "@/lib/pdf-text";
import { runControlChecks, type RuleDoc } from "@/lib/rules";
import type { Batch, Document, Supplier, Transaction, TransactionStatus } from "@/lib/types";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

const now = () => new Date().toISOString();

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- step 1: batch + immutable originals ----------

export async function createBatch(files: File[]): Promise<Batch> {
  if (files.length === 0) throw new Error("No files selected");
  if (files.length > MAX_FILES) throw new Error(`At most ${MAX_FILES} files per batch`);
  for (const file of files) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error(`${file.name} is not a PDF`);
    }
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} exceeds 10 MB`);
  }

  const batch: Batch = { id: crypto.randomUUID(), status: "processing", created_at: now() };
  await db.put("batches", batch);

  const documents: Document[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = crypto.randomUUID();
    await db.put("files", { document_id: id, bytes });
    const doc: Document = {
      id,
      batch_id: batch.id,
      file_name: file.name,
      storage_path: `indexeddb://files/${id}`,
      file_hash: await sha256Hex(bytes),
      mime_type: "application/pdf",
      size_bytes: file.size,
      doc_type: null,
      classification_confidence: null,
      extracted: null,
      normalized: null,
      created_at: now(),
    };
    await db.put("documents", doc);
    documents.push(doc);
  }

  await audit({
    actor: "analyst",
    action: "batch_created",
    subject_type: "batch",
    subject_id: batch.id,
    details: { document_count: documents.length, file_names: documents.map((d) => d.file_name) },
  });
  return batch;
}

// ---------- steps 2–3: classify, extract, normalize ----------

export interface ProcessResult {
  processed: number;
  failures: string[];
  status: Batch["status"];
}

export async function processBatch(
  batchId: string,
  onProgress?: (done: number, total: number, fileName: string) => void
): Promise<ProcessResult> {
  const batch = await db.get("batches", batchId);
  if (!batch) throw new Error("Batch not found");

  const documents = (await db.all("documents"))
    .filter((d) => d.batch_id === batchId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pending = documents.filter((d) => !d.doc_type);

  const failures: string[] = [];
  let processed = 0;
  for (const doc of pending) {
    onProgress?.(processed, pending.length, doc.file_name);
    try {
      const file = await db.get("files", doc.id);
      if (!file) throw new Error("stored PDF is missing");
      const lines = await extractPdfLines(file.bytes);
      const extracted = extractFieldsFromLines(lines);
      const normalized = normalizeExtracted(extracted);

      await db.put("documents", {
        ...doc,
        doc_type: extracted.doc_type,
        classification_confidence: Math.min(1, Math.max(0, extracted.confidence)),
        // PDPA: the raw account number is never persisted, only the masked form.
        extracted: redactExtracted(extracted) as unknown as Record<string, unknown>,
        normalized: normalized as unknown as Record<string, unknown>,
      });
      await audit({
        actor: "system",
        action: "document_classified",
        subject_type: "document",
        subject_id: doc.id,
        details: {
          batch_id: batchId,
          file_name: doc.file_name,
          doc_type: extracted.doc_type,
          confidence: extracted.confidence,
          provider: "local",
        },
      });
      processed += 1;
    } catch (err) {
      failures.push(`${doc.file_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  onProgress?.(processed, pending.length, "");

  const status: Batch["status"] = failures.length > 0 ? "failed" : "ready";
  await db.put("batches", { ...batch, status });
  return { processed, failures, status };
}

// ---------- steps 4–7: supplier, linking, control checks, explanation ----------

export interface LinkResult {
  transaction_id: string;
  txn_code: string;
  supplier_code: string;
  risk_score: number;
  risk_level: Transaction["risk_level"];
  findings: number;
  existing?: boolean;
}

export async function linkBatch(batchId: string): Promise<LinkResult> {
  const existing = (await db.all("transactions")).find((t) => t.batch_id === batchId);
  if (existing) {
    return {
      transaction_id: existing.id,
      txn_code: existing.txn_code,
      supplier_code: "",
      risk_score: existing.risk_score,
      risk_level: existing.risk_level,
      findings: 0,
      existing: true,
    };
  }

  const documents = (await db.all("documents"))
    .filter((d) => d.batch_id === batchId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const docs = documents.filter((d) => d.normalized);
  if (docs.length === 0) throw new Error("No processed documents in batch — process it first");
  const unprocessed = documents.length - docs.length;
  if (unprocessed > 0) {
    throw new Error(`${unprocessed} document(s) are not processed yet — re-run processing before linking`);
  }

  const ruleDocs: RuleDoc[] = docs.map((d) => ({
    id: d.id,
    file_name: d.file_name,
    file_hash: d.file_hash,
    normalized: d.normalized as unknown as NormalizedFields,
  }));
  const norms = ruleDocs.map((d) => d.normalized);

  // --- Supplier resolution: registration number first, then canonical name.
  const regNo = norms.map((n) => n.supplier_registration_number).find(Boolean) ?? null;
  const supplierKey = norms.map((n) => n.supplier_key).find(Boolean) ?? null;
  const supplierName = norms.map((n) => n.supplier_name).find(Boolean) ?? "Unknown supplier";
  const profile = norms.find((n) => n.doc_type === "supplier_profile" && n.bank_account_last4);

  const suppliers = await db.all("suppliers");
  let supplier: Supplier | undefined;
  if (regNo) supplier = suppliers.find((s) => s.registration_number === regNo);
  if (!supplier && supplierKey) supplier = suppliers.find((s) => s.normalized_name === supplierKey);
  if (!supplier) {
    supplier = {
      id: crypto.randomUUID(),
      supplier_code: `SUP-${String(suppliers.length + 1).padStart(3, "0")}`,
      registration_number: regNo,
      name: supplierName,
      normalized_name: supplierKey ?? supplierName.toUpperCase(),
      verified_bank_account_masked: profile?.bank_account_masked ?? null,
      verified_bank_last4: profile?.bank_account_last4 ?? null,
      created_at: now(),
    };
    await db.put("suppliers", supplier);
  } else if (profile && !supplier.verified_bank_last4) {
    supplier = {
      ...supplier,
      verified_bank_account_masked: profile.bank_account_masked,
      verified_bank_last4: profile.bank_account_last4,
    };
    await db.put("suppliers", supplier);
  }

  await audit({
    actor: "system",
    action: "supplier_resolved",
    subject_type: "supplier",
    subject_id: supplier.id,
    details: {
      batch_id: batchId,
      supplier_code: supplier.supplier_code,
      matched_by: regNo ? "registration_number" : "normalized_name",
      document_count: docs.length,
    },
  });

  // --- Assemble the transaction from cross-document references.
  const poNumber = norms.map((n) => n.po_number).find(Boolean) ?? null;
  const invoiceNumber = norms.map((n) => n.invoice_number).find(Boolean) ?? null;
  const totalAmount = norms.map((n) => n.total_amount).find((v) => v != null) ?? null;
  const currency = norms.map((n) => n.currency).find(Boolean) ?? "MYR";
  const refDigits = (poNumber ?? invoiceNumber ?? batchId).replace(/^[A-Z]+-?/i, "");
  // Re-runs re-upload the same documents; suffix the code if the base is taken.
  const baseCode = `TXN-${refDigits}`;
  const taken = (await db.all("transactions")).filter((t) => t.txn_code.startsWith(baseCode));
  const txnCode = taken.length === 0 ? baseCode : `${baseCode}-${taken.length + 1}`;

  const { findings, risk_score, risk_level } = runControlChecks(ruleDocs);

  const transaction: Transaction = {
    id: crypto.randomUUID(),
    txn_code: txnCode,
    batch_id: batchId,
    supplier_id: supplier.id,
    invoice_number: invoiceNumber,
    po_number: poNumber,
    currency,
    total_amount: totalAmount,
    risk_score,
    risk_level,
    status: "open",
    explanation: null,
    created_at: now(),
  };
  await db.put("transactions", transaction);
  await db.putMany(
    "transaction_documents",
    docs.map((d) => ({ transaction_id: transaction.id, document_id: d.id, role: d.doc_type }))
  );
  await db.putMany(
    "findings",
    findings.map((f) => ({ transaction_id: transaction.id, ...f, created_at: now() }))
  );

  // Step 7: narrate the deterministic findings.
  const fileNames = new Map(docs.map((d) => [d.id, d.file_name]));
  const explanation = buildExplanation({
    txn_code: txnCode,
    supplier_name: supplier.name,
    supplier_code: supplier.supplier_code,
    invoice_number: invoiceNumber,
    po_number: poNumber,
    currency,
    total_amount: totalAmount,
    verified_account_masked: supplier.verified_bank_account_masked,
    requested_account_masked:
      norms
        .map((n) => n.bank_account_masked)
        .find((m) => m && m !== supplier.verified_bank_account_masked) ?? null,
    risk_score,
    risk_level,
    findings: findings.map((f) => ({
      ...f,
      source_files: [...new Set(f.evidence.map((e) => fileNames.get(e.document_id) ?? e.document_id))],
    })),
  });
  await db.put("transactions", { ...transaction, explanation });

  await audit({
    actor: "system",
    action: "transaction_linked",
    subject_type: "transaction",
    subject_id: transaction.id,
    details: {
      batch_id: batchId,
      txn_code: txnCode,
      document_count: docs.length,
      linked_by: { po_number: poNumber, invoice_number: invoiceNumber, supplier_code: supplier.supplier_code },
    },
  });
  await audit({
    actor: "system",
    action: "risk_scored",
    subject_type: "transaction",
    subject_id: transaction.id,
    details: {
      risk_score,
      risk_level,
      findings: findings.map((f) => ({ rule: f.rule_code, points: f.points })),
    },
  });
  await audit({
    actor: "system",
    action: "explanation_generated",
    subject_type: "transaction",
    subject_id: transaction.id,
    details: { model: "local-template", finding_count: findings.length },
  });

  return {
    transaction_id: transaction.id,
    txn_code: txnCode,
    supplier_code: supplier.supplier_code,
    risk_score,
    risk_level,
    findings: findings.length,
  };
}

// ---------- step 8: human review ----------

export type ReviewAction = "block_payment" | "request_bank_verification" | "approve";

const ACTIONS: Record<ReviewAction, { audit_action: string; new_status: TransactionStatus | null }> = {
  block_payment: { audit_action: "payment_blocked", new_status: "blocked" },
  request_bank_verification: { audit_action: "bank_verification_requested", new_status: null },
  approve: { audit_action: "payment_approved", new_status: "approved" },
};

export async function reviewAction(
  transactionId: string,
  action: ReviewAction,
  opts: { actor?: string; note?: string } = {}
): Promise<{ status: TransactionStatus }> {
  const config = ACTIONS[action];
  if (!config) throw new Error(`action must be one of: ${Object.keys(ACTIONS).join(", ")}`);
  const txn = await db.get("transactions", transactionId);
  if (!txn) throw new Error("Transaction not found");

  const status = config.new_status ?? txn.status;
  if (config.new_status) await db.put("transactions", { ...txn, status });

  await audit({
    actor: opts.actor?.trim() || "analyst",
    action: config.audit_action,
    subject_type: "transaction",
    subject_id: transactionId,
    details: {
      txn_code: txn.txn_code,
      risk_score: txn.risk_score,
      risk_level: txn.risk_level,
      previous_status: txn.status,
      new_status: status,
      note: opts.note,
    },
  });
  return { status };
}

// ---------- PDPA: deletion ----------

/**
 * Removes the stored PDFs, documents, transactions, findings and links for
 * a batch. Only an audit event recording the deletion (no document content)
 * is retained. Suppliers are kept: they are master data, not batch data.
 */
export async function deleteBatch(batchId: string): Promise<{ files_removed: number }> {
  const batch = await db.get("batches", batchId);
  if (!batch) throw new Error("Batch not found");

  const docIds = (await db.all("documents")).filter((d) => d.batch_id === batchId).map((d) => d.id);
  const txnIds = (await db.all("transactions")).filter((t) => t.batch_id === batchId).map((t) => t.id);
  const findingIds = (await db.all("findings"))
    .filter((f) => txnIds.includes(f.transaction_id))
    .map((f) => f.id);
  const linkKeys = (await db.all("transaction_documents"))
    .filter((l) => txnIds.includes(l.transaction_id))
    .map((l) => [l.transaction_id, l.document_id]);

  await db.deleteMany("files", docIds);
  await db.deleteMany("findings", findingIds);
  await db.deleteMany("transaction_documents", linkKeys);
  await db.deleteMany("transactions", txnIds);
  await db.deleteMany("documents", docIds);
  await db.delete("batches", batchId);

  await audit({
    actor: "analyst",
    action: "batch_deleted",
    subject_type: "batch",
    subject_id: batchId,
    details: { files_removed: docIds.length, reason: "user_requested_deletion" },
  });
  return { files_removed: docIds.length };
}

/** Erase every table, including the audit log. Nothing survives. */
export async function eraseAllData(): Promise<void> {
  await db.clearAll();
}
