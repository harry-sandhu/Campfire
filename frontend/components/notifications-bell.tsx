"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { Notification } from "../lib/types";

export function NotificationsBell() {
  const [data, setData] = useState<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(() => api<typeof data>("/notifications").then(setData).catch(() => undefined), []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function markAll() {
    await api("/notifications/read-all", { method: "POST" });
    await load();
  }

  return (
    <div className="bell" ref={box}>
      <button type="button" className="ghost bell-button" aria-haspopup="true" aria-expanded={open} aria-label={`Notifications, ${data.unread} unread`} onClick={() => setOpen(!open)}>
        Notifications{data.unread > 0 && <span className="badge">{data.unread}</span>}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="bell-head"><strong>Notifications</strong>{data.unread > 0 && <button type="button" className="link-button" onClick={() => void markAll()}>Mark all read</button>}</div>
          {data.notifications.slice(0, 8).map((n) => (
            <Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/notifications"} className={`bell-item${n.readAt ? "" : " unread"}`} onClick={async () => { setOpen(false); if (!n.readAt) { await api(`/notifications/${n._id}/read`, { method: "PATCH" }).catch(() => undefined); void load(); } }}>
              <span>{n.message}</span><small>{timeAgo(n.createdAt)}</small>
            </Link>
          ))}
          {!data.notifications.length && <p className="muted bell-empty">You are all caught up.</p>}
          <Link href="/notifications" className="bell-all" onClick={() => setOpen(false)}>View all</Link>
        </div>
      )}
    </div>
  );
}
