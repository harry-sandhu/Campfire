"use client";
import Link from "next/link";
import { PageHeader } from "../../../components/shell";
import { groupByDay } from "../../../components/notifications-bell";
import { Button } from "../../../components/controls";
import { Empty, ErrorNote, Panel, Skeleton } from "../../../components/ui";
import { api } from "../../../lib/api";
import { timeAgo } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import type { Notification } from "../../../lib/types";

export default function NotificationsPage() {
  const { data, error, loading, reload } = useLoad(() => api<{ notifications: Notification[]; unread: number }>("/notifications"), []);
  return (
    <>
      <PageHeader title="Notifications">
        {!!data?.unread && <Button variant="secondary" onClick={() => api("/notifications/read-all", { method: "POST" }).then(reload)}>Mark all read</Button>}
      </PageHeader>
      <Panel>
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} className="rounded-none border-0" /> : !data?.notifications.length ? <Empty title="You are all caught up" hint="New mentions, assignments and comments will appear here." /> : groupByDay(data.notifications).map((g) => (
          <div key={g.day}>
            <div className="border-b border-line bg-soft/60 px-5 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted">{g.day}</div>
            {g.items.map((n) => (
              <Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/"} className={`flex items-start justify-between gap-4 border-b border-line px-5 py-4 text-sm transition-colors last:border-0 hover:bg-hover ${n.readAt ? "" : "bg-accent-soft/40 font-semibold shadow-[inset_3px_0_0_var(--flame)]"}`} onClick={() => !n.readAt && void api(`/notifications/${n._id}/read`, { method: "PATCH" })}>
                <span>{n.message}</span><small className="shrink-0 font-normal text-muted">{timeAgo(n.createdAt)}</small>
              </Link>
            ))}
          </div>
        ))}
      </Panel>
    </>
  );
}
