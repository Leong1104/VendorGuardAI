"use client";

import { useCallback, useEffect, useState } from "react";

// Tiny data hook for pages that read from IndexedDB: runs the loader on
// mount and whenever `reload` is called (after a write). Loader identity
// is a dependency, so wrap it in useCallback at the call site.
export function useQuery<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loader, version]);

  return { data, error, loading, reload };
}
