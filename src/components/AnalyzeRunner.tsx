"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Kicks off classification/extraction for a batch that still has
// unclassified documents, then refreshes the server-rendered page.
export default function AnalyzeRunner({ batchId }: { batchId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/batches/${batchId}/process`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Processing failed (${res.status})`);
        if (data.failures?.length) throw new Error(data.failures.join("; "));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Processing failed");
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
      Analyzing documents — classifying, extracting, and normalizing each PDF…
    </p>
  );
}
