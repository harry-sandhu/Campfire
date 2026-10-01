"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiBase, getAccessToken, refreshSession } from "../lib/api";
import { useAuth } from "./auth-provider";

export type LiveEvent = { type: string; ticketId?: string; groupId?: string | null; data?: Record<string, unknown> };
type Listener = (event: LiveEvent) => void;
type Ctx = { subscribe: (listener: Listener) => () => void; connected: boolean };

const RealtimeContext = createContext<Ctx>({ subscribe: () => () => undefined, connected: true });

/**
 * Keeps one server-sent-event stream open while signed in. It uses fetch (not EventSource) so the
 * Authorization header can be sent, and reconnects with backoff, refreshing the token when needed.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const listeners = useRef(new Set<Listener>());
  const [connected, setConnected] = useState(true);
  // The API blocks everything except /auth until a temporary password is changed, so wait for that.
  const userId = user && !user.mustChangePassword ? user.id : undefined;

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let controller: AbortController | null = null;
    let delay = 1000;

    const connect = async () => {
      while (!stopped) {
        controller = new AbortController();
        try {
          const response = await fetch(`${apiBase}/events`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, credentials: "include", signal: controller.signal });
          if (response.status === 401) { await refreshSession(); continue; }
          if (!response.ok || !response.body) throw new Error("stream unavailable");
          delay = 1000;
          setConnected(true);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let index;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
              const block = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const line = block.split("\n").find((l) => l.startsWith("data: "));
              if (line) { try { const event = JSON.parse(line.slice(6)) as LiveEvent; listeners.current.forEach((l) => l(event)); } catch { /* ignore malformed event */ } }
            }
          }
        } catch { /* network drop or aborted: retry below */ }
        if (stopped) return;
        // A stream that ends normally (server cap) reconnects at once; real failures are flagged after a short grace period.
        setTimeout(() => !stopped && delay > 1000 && setConnected(false), 4000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 30000);
      }
    };
    void connect();
    return () => { stopped = true; controller?.abort(); };
  }, [userId]);

  const value = useRef<Ctx>({ subscribe: (listener) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, connected: true });
  value.current = { ...value.current, connected };
  return <RealtimeContext.Provider value={value.current}>{children}</RealtimeContext.Provider>;
}

export const useLiveStatus = () => useContext(RealtimeContext).connected;

/** Calls `handler` for each live event. Bursts are coalesced into one call per `wait` ms. */
export function useLiveEvents(handler: (event: LiveEvent) => void, wait = 600) {
  const { subscribe } = useContext(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last: LiveEvent | undefined;
    const unsubscribe = subscribe((event) => {
      last = event;
      clearTimeout(timer);
      timer = setTimeout(() => last && latest.current(last), wait);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [subscribe, wait]);
}
