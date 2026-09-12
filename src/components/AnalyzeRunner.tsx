"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { linkBatch, processBatch } from "@/lib/pipeline";

// Runs the pipeline for a freshly stored batch, entirely in this browser:
// classify/extract/normalize each document, then link them into a
// transaction and run the deterministic control checks. Redirects to the
// transaction when done.
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
        const result = await processBatch(batchId, (done, total, fileName) => {
          if (fileName) setStage(`Reading ${fileName} (${done + 1} of ${total})…`);
        });
        if (result.failures.length) throw new Error(result.failures.join("; "));

        setStage("Resolving supplier, linking documents, running control checks…");
        const linked = await linkBatch(batchId);
        router.push(`/transaction?id=${linked.transaction_id}`);
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
