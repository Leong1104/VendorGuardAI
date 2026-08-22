// Domain types mirroring the database schema (see the
// vendorguard_initial_schema migration in Supabase).

export type BatchStatus = "processing" | "ready" | "failed";

export type DocType =
  | "supplier_profile"
  | "purchase_order"
  | "invoice"
  | "delivery_order"
  | "payment_receipt"
  | "unknown";

export type RiskLevel = "pending" | "low" | "medium" | "high";

export type TransactionStatus = "open" | "blocked" | "approved" | "closed";

export type RuleCode =
  | "duplicate_invoice"
  | "bank_mismatch"
  | "status_conflict"
  | "missing_po_ref"
  | "overdue";

export interface Batch {
  id: string;
  status: BatchStatus;
  created_at: string;
}

export interface Document {
  id: string;
  batch_id: string;
  file_name: string;
  storage_path: string;
  file_hash: string;
  mime_type: string;
  size_bytes: number | null;
  doc_type: DocType | null;
  classification_confidence: number | null;
  extracted: Record<string, unknown> | null;
  normalized: Record<string, unknown> | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  supplier_code: string;
  registration_number: string | null;
  name: string;
  normalized_name: string;
  verified_bank_account_masked: string | null;
  verified_bank_last4: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  txn_code: string;
  batch_id: string | null;
  supplier_id: string | null;
  invoice_number: string | null;
  po_number: string | null;
  currency: string;
  total_amount: number | null;
  risk_score: number;
  risk_level: RiskLevel;
  status: TransactionStatus;
  explanation: string | null;
  created_at: string;
}

export interface FindingEvidence {
  document_id: string;
  field: string;
  value: string;
}

export interface Finding {
  id: number;
  transaction_id: string;
  rule_code: RuleCode;
  title: string;
  detail: string;
  points: number;
  evidence: FindingEvidence[];
  created_at: string;
}

export interface AuditEvent {
  id: number;
  actor: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
