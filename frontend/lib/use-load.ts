import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data and ignores responses from superseded requests, so fast typing cannot show stale results. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const run = useCallback(() => {
    const id = ++latest.current;
    setLoading(true);
    load()
      .then((result) => {
        if (id !== latest.current) return;
        setData(result);
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
    load().then((result) => id === latest.current && setData(result)).catch(() => undefined);
  }, deps);

  return { data, error, loading, reload: run, refresh, setData };
}
