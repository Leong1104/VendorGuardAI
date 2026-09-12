import Link from "next/link";
import { notFound } from "next/navigation";

import ReviewActions from "@/components/ReviewActions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AuditEvent,
  Document,
  Finding,
  Supplier,
  Transaction,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const RISK_META: Record<string, { badge: string; bar: string; label: string }> = {
  high: {
    badge: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
    bar: "bg-red-500",
    label: "High risk",
  },
  medium: {
    badge:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
    bar: "bg-amber-500",
    label: "Medium risk",
  },
  low: {
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
    bar: "bg-emerald-500",
    label: "Low risk",
  },
  pending: {
    badge:
      "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
    bar: "bg-zinc-400",
    label: "Pending",
  },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_profile: "Supplier profile",
  purchase_order: "Purchase order",
  invoice: "Invoice",
  delivery_order: "Delivery order",
  payment_receipt: "Payment receipt",
  unknown: "Unknown",
};

const EVENT_LABEL: Record<string, string> = {
  transaction_linked: "Transaction linked",
  risk_scored: "Risk scored",
  explanation_generated: "Explanation generated",
  payment_blocked: "Payment blocked",
  bank_verification_requested: "Bank verification requested",
  payment_approved: "Payment approved",
};

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
      {children}
    </h2>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className={`text-right text-sm font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

// The AI narrative arrives as plain text with "- " bullet lines. Render
// paragraphs and bullets properly, bolding each finding name before ":".
function ExplanationBody({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {lines.map((line, i) => {
        if (line.startsWith("- ")) {
          const item = line.slice(2);
          const colon = item.indexOf(":");
          const head = colon > 0 && colon < 80 ? item.slice(0, colon) : null;
          const rest = head ? item.slice(colon + 1).trim() : item;
          return (
            <div key={i} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {head && (
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {head}:{" "}
                  </span>
                )}
                {rest}
              </p>
            </div>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {line}
          </p>
        );
      })}
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

  const [{ data: supplier }, { data: findings }, { data: links }, { data: auditEvents }] =
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
      supabase
        .from("audit_events")
        .select()
        .eq("subject_id", id)
        .order("created_at", { ascending: true })
        .returns<AuditEvent[]>(),
    ]);

  const documents = (links ?? [])
    .map((l) => l.documents as unknown as Document)
    .filter(Boolean);
  const docName = (docId: string) =>
    documents.find((d) => d.id === docId)?.file_name ?? docId;

  const requestedAccount = documents
    .map(
      (d) =>
        (d.normalized as Record<string, unknown> | null)?.bank_account_masked as
          | string
          | null
    )
    .find((masked) => masked && masked !== supplier?.verified_bank_account_masked);

  const risk = RISK_META[txn.risk_level] ?? RISK_META.pending;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-6 py-10">
      {/* Header with risk meter */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {txn.batch_id && (
              <Link
                href={`/batches/${txn.batch_id}`}
                className="text-xs text-zinc-400 hover:text-zinc-600 hover:underline dark:hover:text-zinc-200"
              >
                ← Batch documents
              </Link>
            )}
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {txn.txn_code}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {supplier ? `${supplier.name} · ` : ""}
              {txn.total_amount != null
                ? `${txn.currency} ${Number(txn.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                : ""}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ring-inset ${risk.badge}`}
          >
            {risk.label} · {txn.risk_score}/100
          </span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Risk score</span>
            <span>≥ 50 requires human verification</span>
          </div>
          <div className="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${risk.bar}`}
              style={{ width: `${txn.risk_score}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-300 dark:bg-zinc-600" />
          </div>
        </div>

        {txn.risk_level === "high" && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            Human verification is required before any further payment on this
            transaction.
          </p>
        )}
      </Card>

      {/* AI explanation */}
      {txn.explanation && (
        <section>
          <SectionTitle>Why this was flagged</SectionTitle>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-gradient-to-r from-amber-50/60 to-transparent px-6 py-3.5 dark:border-zinc-800 dark:from-amber-950/30">
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden>
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
                Analyst explanation
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                AI-narrated · grounded in the findings below
              </span>
            </div>
            <div className="px-6 py-5">
              <ExplanationBody text={txn.explanation} />
              <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-400 dark:border-zinc-800">
                This narrative is generated from the deterministic rule findings
                only — the AI cannot add, remove, or re-score risks. Every
                finding below cites its source documents.
              </p>
            </div>
          </Card>
        </section>
      )}

      {/* Review actions */}
      <section>
        <SectionTitle>Analyst review</SectionTitle>
        <Card className="p-6">
          <ReviewActions transactionId={txn.id} status={txn.status} />
        </Card>
      </section>

      {/* Linked transaction summary */}
      <section>
        <SectionTitle>Linked transaction</SectionTitle>
        <Card className="px-6 py-3">
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
            <SummaryRow
              label="Supplier"
              value={supplier ? `${supplier.name} (${supplier.supplier_code})` : null}
            />
            <SummaryRow
              label="Registration no."
              value={supplier?.registration_number ?? null}
              mono
            />
            <SummaryRow label="Invoice no." value={txn.invoice_number} mono />
            <SummaryRow label="PO no." value={txn.po_number} mono />
            <SummaryRow
              label="Total"
              value={
                txn.total_amount != null
                  ? `${txn.currency} ${Number(txn.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                  : null
              }
            />
            <SummaryRow
              label="Verified bank account"
              value={supplier?.verified_bank_account_masked ?? null}
              mono
            />
            <SummaryRow
              label="Requested/paid account"
              value={requestedAccount ?? null}
              mono
            />
            <SummaryRow label="Status" value={txn.status} />
          </dl>
        </Card>
      </section>

      {/* Findings */}
      <section>
        <SectionTitle>Control findings ({findings?.length ?? 0})</SectionTitle>
        <div className="space-y-3">
          {(findings ?? []).map((finding) => (
            <Card
              key={finding.id}
              className="border-l-4 !border-l-red-400 p-5 dark:!border-l-red-600"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="font-semibold">{finding.title}</p>
                <span className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
                  +{finding.points} pts
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {finding.detail}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {finding.evidence.map((ev, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700"
                    title={ev.document_id}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400" aria-hidden>
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
                      <path d="M15 2v5h5" />
                    </svg>
                    <span className="font-medium">{docName(ev.document_id)}</span>
                    <span className="text-zinc-400">
                      {ev.field} = {ev.value}
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          ))}
          {(findings ?? []).length === 0 && (
            <Card className="p-5 text-sm text-zinc-400">
              No control failures detected.
            </Card>
          )}
        </div>
      </section>

      {/* Source documents */}
      <section>
        <SectionTitle>Source documents ({documents.length})</SectionTitle>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.file_name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-zinc-400">
                    sha256 {doc.file_hash.slice(0, 16)}…
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
                  {doc.doc_type ? DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* Audit trail */}
      <section>
        <SectionTitle>Audit trail</SectionTitle>
        <Card className="p-5">
          <ol className="relative space-y-4 border-l border-zinc-200 pl-5 dark:border-zinc-700">
            {(auditEvents ?? []).map((event) => (
              <li key={event.id} className="relative">
                <span
                  className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-zinc-900 ${
                    event.actor === "analyst" ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600"
                  }`}
                />
                <p className="text-sm font-medium">
                  {EVENT_LABEL[event.action] ?? event.action.replaceAll("_", " ")}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {new Date(event.created_at).toLocaleString()} · {event.actor}
                </p>
              </li>
            ))}
            {(auditEvents ?? []).length === 0 && (
              <li className="text-sm text-zinc-400">No events recorded.</li>
            )}
          </ol>
        </Card>
      </section>
    </main>
  );
}
