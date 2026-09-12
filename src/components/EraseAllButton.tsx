"use client";

import { useState } from "react";

import { eraseAllData } from "@/lib/pipeline";

// PDPA: everything VendorGuard stores lives in this browser. This wipes all
// of it — batches, PDFs, findings, suppliers, and the audit log.
export default function EraseAllButton({ onDone }: { onDone: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function erase() {
    setBusy(true);
    try {
      await eraseAllData();
      onDone();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline"
      >
        Erase all local data
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-300">
        Removes every batch, PDF, finding, supplier and audit record from this browser.
      </span>
      <button
        onClick={erase}
        disabled={busy}
        className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-40"
      >
        {busy ? "Erasing…" : "Confirm erase"}
      </button>
      <button onClick={() => setConfirming(false)} disabled={busy} className="text-zinc-500 hover:underline">
        Cancel
      </button>
    </span>
  );
}
