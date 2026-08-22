"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Runs the pipeline for a freshly uploaded batch: classify/extract/normalize
// each document, then link them into a transaction and run the deterministic
// control checks. Redirects to the transaction when done.
export default function AnalyzeRunner({ batchId }: { batchId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [stage, setStage] = useState(
    "Classifying, extracting, and normalizing each PDF…"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const processRes = await fetch(`/api/batches/${batchId}/process`, {
          method: "POST",
        });
        const processData = await processRes.json();
        if (!processRes.ok) {
          throw new Error(processData.error ?? `Processing failed (${processRes.status})`);
        }
        if (processData.failures?.length) {
          throw new Error(processData.failures.join("; "));
        }

        setStage("Resolving supplier, linking documents, running control checks…");
        const linkRes = await fetch(`/api/batches/${batchId}/link`, {
          method: "POST",
        });
        const linkData = await linkRes.json();
        if (!linkRes.ok) {
          throw new Error(linkData.error ?? `Linking failed (${linkRes.status})`);
        }

        router.push(`/transactions/${linkData.transaction_id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed");
      }
    })();
  }, [batchId, router]);

  if (error) {
    return (
      <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        Analysis failed: {error}
      </p>
    );
  }
  return (
    <p className="animate-pulse rounded-lg bg-zinc-100 p-4 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {stage}
    </p>
  );
}
