import { useCallback, useEffect, useRef, useState } from "react";

// Stale-while-revalidate cache: revisiting a page shows the last result instantly while a fresh copy loads.
const cache = new Map<string, unknown>();
export const clearLoadCache = () => cache.clear();

/** Loads data and ignores responses from superseded requests, so fast typing cannot show stale results. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const key = `${load.toString()}|${JSON.stringify(deps)}`;
  const cached = cache.get(key) as T | undefined;
  const [data, setDataState] = useState<T | null>(cached ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(cached === undefined);
  const latest = useRef(0);
  const setData = (value: T | null | ((previous: T | null) => T | null)) => setDataState(value as never);

  const run = useCallback(() => {
    const id = ++latest.current;
    if (!cache.has(key)) setLoading(true);
    load()
      .then((result) => {
        if (id !== latest.current) return;
        cache.set(key, result);
        setDataState(result);
        setError("");
      })
      .catch((e: Error) => id === latest.current && setError(e.message))
      .finally(() => id === latest.current && setLoading(false));
  }, deps);

  useEffect(() => {
    run();
    return () => {
      latest.current++;
    };
  }, [run]);

  /** Refetch without flashing the loading state, used for live updates. */
  const refresh = useCallback(() => {
    const id = ++latest.current;
    load().then((result) => { if (id === latest.current) { cache.set(key, result); setDataState(result); } }).catch(() => undefined);
  }, deps);

  return { data, error, loading, reload: run, refresh, setData };
}
