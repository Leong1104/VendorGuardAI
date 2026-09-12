"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deleteBatch } from "@/lib/pipeline";

// PDPA: the analyst controls uploaded data and can delete it at any time.
export default function DeleteBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteBatch(batchId);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline"
      >
        Delete this batch and all extracted data
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-300">
        Permanently removes the PDFs, extracted fields, transaction, and
        findings. Only the deletion audit record is kept.
      </span>
      <button
        onClick={onDelete}
        disabled={busy}
        className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Confirm delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="shrink-0 text-zinc-500 hover:underline"
      >
        Cancel
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
