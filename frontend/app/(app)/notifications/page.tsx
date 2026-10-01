"use client";
import Link from "next/link";
import { PageHeader } from "../../../components/shell";
import { Empty, ErrorNote, Spinner } from "../../../components/ui";
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
        {loading && !data ? <Spinner /> : !data?.notifications.length ? <Empty title="You are all caught up" /> : data.notifications.map((n) => (
          <Link key={n._id} href={n.ticketId ? `/tickets/${n.ticketId}` : "/"} className={`bell-item page${n.readAt ? "" : " unread"}`} onClick={() => !n.readAt && void api(`/notifications/${n._id}/read`, { method: "PATCH" })}>
            <span>{n.message}</span><small>{timeAgo(n.createdAt)}</small>
          </Link>
        ))}
      </section>
    </>
  );
}
