"use client";
import Link from "next/link";
import { useAuth } from "../../../components/auth-provider";
import { PageHeader } from "../../../components/shell";
import { Avatar, Empty, ErrorNote, Panel, Skeleton } from "../../../components/ui";
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
      <PageHeader title="Activity" eyebrow="Insight" />
      <Panel title="Recent events" description="Changes to tickets you can see.">
        {!allowed ? <Empty title="No access" hint="You need the activity.view permission." /> : error ? <ErrorNote message={error} /> : loading && !data ? <Skeleton rows={5} className="rounded-none border-0" /> : !data?.logs.length ? <Empty title="No activity yet" /> : (
          <ol className="m-0 list-none p-0">
            {data.logs.map((log) => (
              <li key={log._id} className="flex items-start gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
                <Avatar name={log.actorId?.name ?? "User"} size={30} />
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">{log.actorId?.name ?? "User"}</span> <span className="text-muted">{label(log.type).toLowerCase()}</span>
                  {log.ticketId && <> on <Link href={`/tickets/${log.ticketId._id}`} className="font-medium hover:text-accent hover:underline"><span className="mr-1 font-mono text-xs text-muted">{log.ticketId.ticketNumber}</span>{log.ticketId.title}</Link></>}
                </p>
                <small className="shrink-0 text-muted">{timeAgo(log.createdAt)}</small>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
