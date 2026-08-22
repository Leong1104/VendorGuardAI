import Link from "next/link";
import { notFound } from "next/navigation";

import AnalyzeRunner from "@/components/AnalyzeRunner";
import DeleteBatchButton from "@/components/DeleteBatchButton";
import type { NormalizedFields } from "@/lib/extract";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Batch, Document } from "@/lib/types";

export const dynamic = "force-dynamic";

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_profile: "Supplier profile",
  purchase_order: "Purchase order",
  invoice: "Invoice",
  delivery_order: "Delivery order",
  payment_receipt: "Payment receipt",
  unknown: "Unknown",
};

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function NormalizedView({ n }: { n: NormalizedFields }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-zinc-100 pt-3 sm:grid-cols-3 dark:border-zinc-800">
      <Field label="Supplier" value={n.supplier_name} />
      <Field label="Registration no." value={n.supplier_registration_number} />
      <Field label="Bank account" value={n.bank_account_masked} />
      <Field label="Invoice no." value={n.invoice_number} />
      <Field label="PO no." value={n.po_number} />
      <Field label="DO no." value={n.delivery_order_number} />
      <Field label="Receipt no." value={n.receipt_number} />
      <Field
        label="Total"
        value={
          n.total_amount != null
            ? `${n.currency ?? ""} ${n.total_amount.toFixed(2)}`.trim()
            : null
        }
      />
      <Field label="Payment status" value={n.payment_status} />
      <Field label="Issue date" value={n.issue_date} />
      <Field label="Due date" value={n.due_date} />
      <Field label="Delivery date" value={n.delivery_date} />
      <Field label="Payment date" value={n.payment_date} />
    </dl>
  );
}

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: batch } = await supabase
    .from("batches")
    .select()
    .eq("id", id)
    .maybeSingle<Batch>();
  if (!batch) notFound();

  const [{ data: documents }, { data: transaction }] = await Promise.all([
    supabase
      .from("documents")
      .select()
      .eq("batch_id", id)
      .order("created_at")
      .returns<Document[]>(),
    supabase
      .from("transactions")
      .select("id, txn_code, risk_score, risk_level")
      .eq("batch_id", id)
      .maybeSingle(),
  ]);

  const docs = documents ?? [];
  const hasUnclassified = docs.some((d) => !d.doc_type);

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 p-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← New batch
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Batch</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {batch.id} · status:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {batch.status}
          </span>{" "}
          · uploaded {new Date(batch.created_at).toLocaleString()}
        </p>
      </div>

      {hasUnclassified && batch.status !== "failed" && (
        <AnalyzeRunner batchId={batch.id} />
      )}

      {transaction && (
        <Link
          href={`/transactions/${transaction.id}`}
          className="block rounded-xl border border-zinc-200 p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-500"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{transaction.txn_code}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Linked transaction with control findings →
              </p>
            </div>
            <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">
              {String(transaction.risk_level).toUpperCase()} ·{" "}
              {transaction.risk_score}/100
            </span>
          </div>
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Documents ({docs.length})</h2>
        <ul className="space-y-3">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{doc.file_name}</p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {doc.id} · sha256 {doc.file_hash.slice(0, 12)}…
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                  {doc.doc_type
                    ? `${DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}${
                        doc.classification_confidence != null
                          ? ` · ${(doc.classification_confidence * 100).toFixed(0)}%`
                          : ""
                      }`
                    : "Not classified yet"}
                </span>
              </div>
              {doc.normalized && (
                <NormalizedView n={doc.normalized as unknown as NormalizedFields} />
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteBatchButton batchId={batch.id} />
      </footer>
    </main>
  );
}
