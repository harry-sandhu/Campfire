"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { Notification } from "../lib/types";
import { BellIcon } from "./icons";
import { Popover } from "./popover";
import { useLiveEvents } from "./realtime";

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, new Date(today.getTime() - 86400000))) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export function groupByDay(items: Notification[]) {
  const groups: { day: string; items: Notification[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.createdAt);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(item); else groups.push({ day, items: [item] });
  }
  return groups;
}

export function NotificationsBell() {
  const [data, setData] = useState<{ notifications: Notification[]; unread: number }>({ notifications: [], unread: 0 });
  const load = useCallback(() => api<typeof data>("/notifications").then(setData).catch(() => undefined), []);

  useLiveEvents((event) => { if (event.type === "notification.created") void load(); }, 200);
  useEffect(() => {
    void load();
    const timer = setInterval(() => document.visibilityState === "visible" && void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="bell">
      <Popover label="Notifications" trigger={({ toggle, ...aria }) => (
        <button type="button" className="icon-button" onClick={toggle} aria-label={`Notifications, ${data.unread} unread`} {...aria}>
          <BellIcon size={18} />{data.unread > 0 && <span className="badge" aria-hidden="true">{data.unread > 9 ? "9+" : data.unread}</span>}
        </button>
      )}>
        {(close) => (
          <div className="bell-menu">
            <div className="bell-head"><strong>Notifications</strong>{data.unread > 0 && <button type="button" className="link-button" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); void load(); }}>Mark all read</button>}</div>
            {groupByDay(data.notifications.slice(0, 12)).map((group) => (
              <div key={group.day}>
                <div className="bell-day">{group.day}</div>
                {group.items.map((n) => (
                  <Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/notifications"} className={`bell-item${n.readAt ? "" : " unread"}`} onClick={async () => { close(); if (!n.readAt) { await api(`/notifications/${n._id}/read`, { method: "PATCH" }).catch(() => undefined); void load(); } }}>
                    <span>{n.message}</span><small>{timeAgo(n.createdAt)}</small>
                  </Link>
                ))}
              </div>
            ))}
            {!data.notifications.length && <p className="muted bell-empty">You are all caught up.</p>}
            <Link href="/notifications" className="bell-all" onClick={close}>View all</Link>
          </div>
        )}
      </Popover>
    </div>
  );
}
