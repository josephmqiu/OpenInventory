import { useEffect, useState } from "react";

interface AsyncDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook that fetches data asynchronously with cancellation, loading, and error state.
 * Replaces the duplicated "cancelled flag" pattern across 8+ components.
 *
 * @param fetcher - Async function that returns data. Called when deps change.
 * @param deps - Dependency array that triggers re-fetch when changed.
 */
export function useAsyncData<T>(
  fetcher: (signal: { cancelled: boolean }) => Promise<T>,
  deps: readonly unknown[],
): AsyncDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    setError(null);

    fetcher(signal)
      .then((result) => {
        if (!signal.cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!signal.cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!signal.cancelled) setLoading(false);
      });

    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
