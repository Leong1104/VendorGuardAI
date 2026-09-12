"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

import AnalyzeRunner from "@/components/AnalyzeRunner";
import DeleteBatchButton from "@/components/DeleteBatchButton";
import { db } from "@/lib/db";
import type { NormalizedFields } from "@/lib/fields";
import { useQuery } from "@/lib/use-query";

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

async function loadBatch(id: string) {
  const batch = await db.get("batches", id);
  if (!batch) return null;
  const documents = (await db.all("documents"))
    .filter((d) => d.batch_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const transaction = (await db.all("transactions")).find((t) => t.batch_id === id) ?? null;
  return { batch, documents, transaction };
}

function BatchView({ id }: { id: string }) {
  const loader = useCallback(() => loadBatch(id), [id]);
  const { data, error, loading } = useQuery(loader);

  if (loading) return <PageMessage>Loading batch…</PageMessage>;
  if (error) return <PageMessage>Could not read local data: {error}</PageMessage>;
  if (!data) return <PageMessage>Batch not found in this browser.</PageMessage>;

  const { batch, documents: docs, transaction } = data;
  const hasUnclassified = docs.some((d) => !d.doc_type);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
      <div>
        <Link
          href="/"
          className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline dark:hover:text-zinc-200"
        >
          ← New batch
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Document batch
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          <span className="font-mono text-xs">{batch.id}</span> · status{" "}
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
          href={`/transaction?id=${transaction.id}`}
          className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-500"
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
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Documents ({docs.length})
        </h2>
        <ul className="space-y-3">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
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

function PageMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <p className="text-sm text-zinc-500">{children}</p>
    </main>
  );
}

// Static export cannot prerender dynamic segments, so the id travels as a
// query parameter. useSearchParams needs a Suspense boundary.
function BatchFromQuery() {
  const id = useSearchParams().get("id");
  if (!id) return <PageMessage>No batch id given.</PageMessage>;
  return <BatchView id={id} />;
}

export default function BatchPage() {
  return (
    <Suspense fallback={<PageMessage>Loading batch…</PageMessage>}>
      <BatchFromQuery />
    </Suspense>
  );
}
