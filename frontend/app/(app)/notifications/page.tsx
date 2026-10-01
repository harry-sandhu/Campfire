"use client";
import Link from "next/link";
import { PageHeader } from "../../../components/shell";
import { groupByDay } from "../../../components/notifications-bell";
import { Empty, ErrorNote, Skeleton } from "../../../components/ui";
import { api } from "../../../lib/api";
import { timeAgo } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import type { Notification } from "../../../lib/types";

export default function NotificationsPage() {
  const { data, error, loading, reload } = useLoad(() => api<{ notifications: Notification[]; unread: number }>("/notifications"), []);
  return (
    <>
      <PageHeader title="Notifications">
        {!!data?.unread && <button type="button" className="ghost" onClick={() => api("/notifications/read-all", { method: "POST" }).then(reload)}>Mark all read</button>}
      </PageHeader>
      <section className="panel">
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} /> : !data?.notifications.length ? <Empty title="You are all caught up" /> : groupByDay(data.notifications).map((g) => <div key={g.day}><div className="bell-day">{g.day}</div>{g.items.map((n) => (<Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/"} className={`bell-item page${n.readAt ? "" : " unread"}`} onClick={() => !n.readAt && void api(`/notifications/${n._id}/read`, { method: "PATCH" })}>
            <span>{n.message}</span><small>{timeAgo(n.createdAt)}</small>
          </Link>))}</div>)}
      </section>
    </>
  );
}
