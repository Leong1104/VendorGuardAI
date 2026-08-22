import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Document, Finding, Supplier, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const RISK_STYLES: Record<string, string> = {
  high: "bg-red-600 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-emerald-600 text-white",
  pending: "bg-zinc-400 text-white",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_profile: "Supplier profile",
  purchase_order: "Purchase order",
  invoice: "Invoice",
  delivery_order: "Delivery order",
  payment_receipt: "Payment receipt",
  unknown: "Unknown",
};

function SummaryRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-6 py-2">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  );
}

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: txn } = await supabase
    .from("transactions")
    .select()
    .eq("id", id)
    .maybeSingle<Transaction>();
  if (!txn) notFound();

  const [{ data: supplier }, { data: findings }, { data: links }] =
    await Promise.all([
      txn.supplier_id
        ? supabase
            .from("suppliers")
            .select()
            .eq("id", txn.supplier_id)
            .maybeSingle<Supplier>()
        : Promise.resolve({ data: null }),
      supabase
        .from("findings")
        .select()
        .eq("transaction_id", id)
        .order("points", { ascending: false })
        .returns<Finding[]>(),
      supabase
        .from("transaction_documents")
        .select("document_id, role, documents(*)")
        .eq("transaction_id", id),
    ]);

  const documents = (links ?? [])
    .map((l) => l.documents as unknown as Document)
    .filter(Boolean);
  const docName = (docId: string) =>
    documents.find((d) => d.id === docId)?.file_name ?? docId;

  const requestedAccount = documents
    .map((d) => (d.normalized as Record<string, unknown> | null)?.bank_account_masked as string | null)
    .find(
      (masked) => masked && masked !== supplier?.verified_bank_account_masked
    );

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-8 p-8">
      <div>
        {txn.batch_id && (
          <Link
            href={`/batches/${txn.batch_id}`}
            className="text-sm text-zinc-500 hover:underline"
          >
            ← Batch documents
          </Link>
        )}
        <div className="mt-2 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{txn.txn_code}</h1>
          <span
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${RISK_STYLES[txn.risk_level]}`}
          >
            {txn.risk_level.toUpperCase()} · {txn.risk_score}/100
          </span>
        </div>
        {txn.risk_level === "high" && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            High risk — human verification required before any further payment.
          </p>
        )}
      </div>

      <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="mb-2 text-lg font-medium">Linked transaction</h2>
        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
          <SummaryRow
            label="Supplier"
            value={
              supplier ? `${supplier.name} (${supplier.supplier_code})` : null
            }
          />
          <SummaryRow
            label="Registration no."
            value={supplier?.registration_number ?? null}
          />
          <SummaryRow label="Invoice no." value={txn.invoice_number} />
          <SummaryRow label="PO no." value={txn.po_number} />
          <SummaryRow
            label="Total"
            value={
              txn.total_amount != null
                ? `${txn.currency} ${Number(txn.total_amount).toFixed(2)}`
                : null
            }
          />
          <SummaryRow
            label="Verified bank account"
            value={supplier?.verified_bank_account_masked ?? null}
          />
          <SummaryRow
            label="Requested/paid account"
            value={requestedAccount ?? null}
          />
          <SummaryRow label="Status" value={txn.status} />
        </dl>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Control findings ({findings?.length ?? 0})
        </h2>
        <ul className="space-y-3">
          {(findings ?? []).map((finding) => (
            <li
              key={finding.id}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium">{finding.title}</p>
                <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                  +{finding.points}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {finding.detail}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {finding.evidence.map((ev, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    title={ev.document_id}
                  >
                    {docName(ev.document_id)} · {ev.field} = {ev.value}
                  </span>
                ))}
              </div>
            </li>
          ))}
          {(findings ?? []).length === 0 && (
            <li className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
              No control failures detected.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">
          Source documents ({documents.length})
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.file_name}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {doc.id} · sha256 {doc.file_hash.slice(0, 12)}…
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
                {doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type : "—"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
