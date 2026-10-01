"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { Notification } from "../lib/types";
import { IconButton } from "./controls";
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
    <Popover label="Notifications" className="w-[380px]" trigger={({ toggle, ...aria }) => (
      <IconButton label={`Notifications, ${data.unread} unread`} onClick={toggle} {...aria}>
        <BellIcon size={18} />
        {data.unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-flame px-1 text-[10px] font-bold leading-4 text-[#fffaf3]" aria-hidden="true">{data.unread > 9 ? "9+" : data.unread}</span>}
      </IconButton>
    )}>
      {(close) => (
        <div className="-m-1.5">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <strong className="text-sm">Notifications</strong>
            {data.unread > 0 && <button type="button" className="text-[13px] font-semibold text-accent hover:underline" onClick={async () => { await api("/notifications/read-all", { method: "POST" }); void load(); }}>Mark all read</button>}
          </div>
          <div className="max-h-[60vh] overflow-auto">
            {groupByDay(data.notifications.slice(0, 12)).map((group) => (
              <div key={group.day}>
                <div className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-widest text-muted">{group.day}</div>
                {group.items.map((n) => (
                  <Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/notifications"} className={`flex items-start justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0 hover:bg-hover ${n.readAt ? "" : "bg-accent-soft/50 font-semibold shadow-[inset_3px_0_0_var(--flame)]"}`} onClick={async () => { close(); if (!n.readAt) { await api(`/notifications/${n._id}/read`, { method: "PATCH" }).catch(() => undefined); void load(); } }}>
                    <span>{n.message}</span><small className="whitespace-nowrap font-normal text-muted">{timeAgo(n.createdAt)}</small>
                  </Link>
                ))}
              </div>
            ))}
            {!data.notifications.length && <p className="p-5 text-center text-muted">You are all caught up.</p>}
          </div>
          <Link href="/notifications" className="block border-t border-line p-3 text-center text-[13px] font-semibold text-accent hover:bg-hover" onClick={close}>View all</Link>
        </div>
      )}
    </Popover>
  );
}
