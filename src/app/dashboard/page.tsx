import Link from "next/link";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AuditEvent, Supplier, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

const RISK_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  blocked: "⛔ Blocked",
  approved: "✓ Approved",
  closed: "Closed",
};

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums ${
          accent && value > 0 ? "text-red-600 dark:text-red-400" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

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
      .limit(12)
      .returns<AuditEvent[]>(),
  ]);

  const txns = transactions ?? [];
  const highRisk = txns.filter((t) => t.risk_level === "high").length;
  const blocked = txns.filter((t) => t.status === "blocked").length;
  const supplierName = (id: string | null) =>
    suppliers?.find((s) => s.id === id)?.name ?? "—";

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-8 p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Accounts-payable control overview
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          New batch
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Batches analyzed" value={batchCount ?? 0} />
        <StatTile label="Transactions" value={txns.length} />
        <StatTile label="High risk" value={highRisk} accent />
        <StatTile label="Payments blocked" value={blocked} accent />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Transactions</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-3 font-medium">Transaction</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {txns.map((t) => (
                <tr
                  key={t.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/transactions/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.txn_code}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-4 py-3">{supplierName(t.supplier_id)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.total_amount != null
                      ? `${t.currency} ${Number(t.total_amount).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_BADGE[t.risk_level]}`}
                    >
                      {t.risk_level.toUpperCase()} {t.risk_score}/100
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {STATUS_LABEL[t.status] ?? t.status}
                  </td>
                </tr>
              ))}
              {txns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No transactions yet — upload a batch to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {findingCount ?? 0} control finding(s) across all transactions, each
          citing its source documents.
        </p>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-medium">Supplier registry</h2>
          <ul className="space-y-2">
            {(suppliers ?? []).map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{s.name}</p>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs dark:bg-zinc-800">
                    {s.supplier_code}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Reg. {s.registration_number ?? "—"} · Verified account{" "}
                  {s.verified_bank_account_masked ?? "—"}
                </p>
              </li>
            ))}
            {(suppliers ?? []).length === 0 && (
              <li className="text-sm text-zinc-500">No suppliers resolved yet.</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Recent activity</h2>
          <ul className="space-y-2">
            {(recentEvents ?? []).map((event) => (
              <li
                key={event.id}
                className="flex items-baseline gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
              >
                <span className="shrink-0 font-mono text-xs text-zinc-400">
                  {new Date(event.created_at).toLocaleTimeString()}
                </span>
                <span className="min-w-0 truncate">
                  <span className="font-medium">
                    {event.action.replaceAll("_", " ")}
                  </span>{" "}
                  <span className="text-xs text-zinc-500">by {event.actor}</span>
                </span>
              </li>
            ))}
            {(recentEvents ?? []).length === 0 && (
              <li className="text-sm text-zinc-500">No activity yet.</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
