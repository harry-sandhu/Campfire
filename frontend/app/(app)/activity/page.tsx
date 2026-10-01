"use client";
import Link from "next/link";
import { useAuth } from "../../../components/auth-provider";
import { PageHeader } from "../../../components/shell";
import { Empty, ErrorNote, Spinner } from "../../../components/ui";
import { api } from "../../../lib/api";
import { label, timeAgo } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import type { Activity } from "../../../lib/types";

export default function ActivityPage() {
  const { can } = useAuth();
  const allowed = can("activity.view");
  const { data, error, loading } = useLoad(() => (allowed ? api<{ logs: Activity[] }>("/activity") : Promise.resolve({ logs: [] })), [allowed]);

  return (
    <>
      <PageHeader title="Activity" />
      <section className="panel">
        <div className="panel-head"><div><h2>Recent events</h2><p className="muted">Changes to tickets you can see.</p></div></div>
        {!allowed ? <Empty title="No access" hint="You need the activity.view permission." /> : error ? <ErrorNote message={error} /> : loading && !data ? <Spinner /> : !data?.logs.length ? <Empty title="No activity yet" /> : (
          <div className="activity-list activity-page">
            {data.logs.map((log) => (
              <p key={log._id}>
                <span>{log.actorId?.name ?? "User"}</span> {label(log.type).toLowerCase()}
                {log.ticketId && <> on <Link href={`/tickets/${log.ticketId._id}`} className="ticket-id">{log.ticketId.ticketNumber}</Link> {log.ticketId.title}</>}
                {" "}<small className="muted">{timeAgo(log.createdAt)}</small>
              </p>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
