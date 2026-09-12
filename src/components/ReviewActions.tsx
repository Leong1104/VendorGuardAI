"use client";

import { useState } from "react";

import { reviewAction, type ReviewAction } from "@/lib/pipeline";

// Step 8: human review controls. Each action is recorded as an audit event.
export default function ReviewActions({
  transactionId,
  status,
  onChange,
}: {
  transactionId: string;
  status: string;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: ReviewAction) {
    setBusy(action);
    setError(null);
    try {
      await reviewAction(transactionId, action);
      if (action === "request_bank_verification") setRequested(true);
      onChange();
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
