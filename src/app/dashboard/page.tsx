import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AuditEvent, Supplier, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const RISK_BADGE: Record<string, string> = {
  high: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  medium:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  low: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  pending:
    "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open: {
    label: "Open",
    cls: "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700",
  },
  blocked: {
    label: "Blocked",
    cls: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  },
  approved: {
    label: "Approved",
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  },
  closed: {
    label: "Closed",
    cls: "bg-zinc-50 text-zinc-500 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700",
  },
};

const EVENT_LABEL: Record<string, string> = {
  batch_created: "Batch uploaded",
  document_classified: "Document classified",
  supplier_resolved: "Supplier resolved",
  transaction_linked: "Transaction linked",
  risk_scored: "Risk scored",
  explanation_generated: "Explanation generated",
  payment_blocked: "Payment blocked",
  bank_verification_requested: "Bank verification requested",
  payment_approved: "Payment approved",
  batch_deleted: "Batch data deleted",
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

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  const hot = accent && value > 0;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {label}
        </p>
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            hot
              ? "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${
          hot ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

const icons = {
  batches: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  txns: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3 4 7l4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </svg>
  ),
  risk: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
  blocked: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  ),
};

export default async function DashboardPage() {
  const supabase = getSupabaseAdmin();

  const [
    { count: batchCount },
    { data: transactions },
    { count: findingCount },
    { data: suppliers },
    { data: recentEvents },
  ] = await Promise.all([
    supabase.from("batches").select("*", { count: "exact", head: true }),
    supabase
      .from("transactions")
      .select()
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<Transaction[]>(),
    supabase.from("findings").select("*", { count: "exact", head: true }),
    supabase
      .from("suppliers")
      .select()
      .order("supplier_code")
      .returns<Supplier[]>(),
    supabase
      .from("audit_events")
      .select()
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<AuditEvent[]>(),
  ]);

  const txns = transactions ?? [];
  const highRisk = txns.filter((t) => t.risk_level === "high").length;
  const blocked = txns.filter((t) => t.status === "blocked").length;
  const supplierName = (id: string | null) =>
    suppliers?.find((s) => s.id === id)?.name ?? "—";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Accounts-payable control overview · {findingCount ?? 0} control
            finding{(findingCount ?? 0) === 1 ? "" : "s"} recorded
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-white dark:text-zinc-900"
        >
          + New batch
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Batches" value={batchCount ?? 0} icon={icons.batches} />
        <StatTile label="Transactions" value={txns.length} icon={icons.txns} />
        <StatTile label="High risk" value={highRisk} icon={icons.risk} accent />
        <StatTile label="Blocked" value={blocked} icon={icons.blocked} accent />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          Transactions
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wider text-zinc-400 dark:border-zinc-800">
                  <th className="px-5 py-3.5 font-medium">Transaction</th>
                  <th className="px-5 py-3.5 font-medium">Supplier</th>
                  <th className="px-5 py-3.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-3.5 font-medium">Risk</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {txns.map((t) => {
                  const status = STATUS_BADGE[t.status] ?? STATUS_BADGE.open;
                  return (
                    <tr
                      key={t.id}
                      className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/transactions/${t.id}`}
                          className="font-medium hover:underline"
                        >
                          {t.txn_code}
                        </Link>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {new Date(t.created_at).toLocaleDateString("en-MY", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">{supplierName(t.supplier_id)}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums">
                        {t.total_amount != null
                          ? `${t.currency} ${Number(t.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${RISK_BADGE[t.risk_level]}`}
                        >
                          {t.risk_level.toUpperCase()}
                          <span className="font-normal opacity-70">
                            {t.risk_score}/100
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.cls}`}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {txns.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-zinc-400">
                      No transactions yet — upload a batch to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Supplier registry
          </h2>
          <div className="space-y-3">
            {(suppliers ?? []).map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{s.name}</p>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {s.supplier_code}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-zinc-400">Registration</dt>
                    <dd className="mt-0.5 font-medium">
                      {s.registration_number ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-400">Verified account</dt>
                    <dd className="mt-0.5 font-mono font-medium">
                      {s.verified_bank_account_masked ?? "—"}
                    </dd>
                  </div>
                </dl>
              </Card>
            ))}
            {(suppliers ?? []).length === 0 && (
              <Card className="p-4 text-sm text-zinc-400">
                No suppliers resolved yet.
              </Card>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Recent activity
          </h2>
          <Card className="p-2">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(recentEvents ?? []).map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      event.actor === "analyst" ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {EVENT_LABEL[event.action] ?? event.action.replaceAll("_", " ")}
                    <span className="ml-1.5 text-xs text-zinc-400">
                      {event.actor}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-zinc-400">
                    {new Date(event.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
              {(recentEvents ?? []).length === 0 && (
                <li className="px-3 py-2.5 text-sm text-zinc-400">
                  No activity yet.
                </li>
              )}
            </ul>
          </Card>
        </section>
      </div>
    </main>
  );
}
