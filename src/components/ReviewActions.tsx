"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Step 8: human review controls. Each action is recorded as an audit event.
export default function ReviewActions({
  transactionId,
  status,
}: {
  transactionId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Action failed (${res.status})`);
      if (action === "request_bank_verification") setRequested(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => act("block_payment")}
          disabled={busy !== null || status === "blocked"}
          className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:bg-red-700 disabled:opacity-40"
        >
          {status === "blocked"
            ? "Payment blocked"
            : busy === "block_payment"
              ? "Blocking…"
              : "Block payment"}
        </button>
        <button
          onClick={() => act("request_bank_verification")}
          disabled={busy !== null || requested}
          className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-semibold transition-colors hover:border-zinc-500 disabled:opacity-40 dark:border-zinc-700 dark:hover:border-zinc-400"
        >
          {requested
            ? "Verification requested"
            : busy === "request_bank_verification"
              ? "Requesting…"
              : "Request bank verification"}
        </button>
      </div>
      {status === "blocked" && (
        <p className="text-sm text-zinc-500">
          No further payment can be processed. Verify the beneficiary change
          through an approved channel before releasing.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
