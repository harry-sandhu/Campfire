"use client";
import Link from "next/link";
import { useAuth } from "../../components/auth-provider";
import { useLiveEvents } from "../../components/realtime";
import { PageHeader } from "../../components/shell";
import { Empty, ErrorNote, Skeleton, Stat, TicketRow } from "../../components/ui";
import { api } from "../../lib/api";
import { greeting } from "../../lib/format";
import { useLoad } from "../../lib/use-load";
import type { Ticket } from "../../lib/types";

type Dashboard = { counts: { open: number; inProgress: number; inReview: number; blocked: number; completed: number; overdue: number }; overdue: Ticket[]; dueSoon: Ticket[]; mine: Ticket[]; recent: Ticket[] };

function Section({ title, hint, href, linkLabel, tickets }: { title: string; hint?: string; href?: string; linkLabel?: string; tickets: Ticket[] }) {
  if (!tickets.length) return null;
  return (
    <section>
      <div className="section-label"><div><h2>{title}</h2>{hint && <p className="muted" style={{ margin: 0, fontSize: 13 }}>{hint}</p>}</div>{href && <Link href={href} className="link-button">{linkLabel}</Link>}</div>
      <div className="panel">{tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}</div>
    </section>
  );
}

export default function OverviewPage() {
  const { user, can } = useAuth();
  const allowed = can("tickets.view");
  const { data, error, loading, refresh } = useLoad(() => (allowed ? api<Dashboard>("/dashboard") : Promise.resolve(null)), [allowed]);
  useLiveEvents((event) => { if (event.type.startsWith("ticket.") || event.type === "comment.created") refresh(); });

  const nothing = data && !data.overdue.length && !data.dueSoon.length && !data.mine.length && !data.recent.length;
  // A ticket shown under Overdue or Due soon should not appear again under Assigned to me.
  const seen = new Set([...(data?.overdue ?? []), ...(data?.dueSoon ?? [])].map((t) => t.id));
  const assigned = (data?.mine ?? []).filter((t) => !seen.has(t.id));

  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.name.split(" ")[0]}`} eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} />
      {!allowed ? <Empty title="No ticket access yet" hint="Ask an administrator for the tickets.view permission." />
        : loading && !data ? <Skeleton rows={6} />
        : <>
          <ErrorNote message={error} />
          {data && <>
            <div className="stats">
              <Stat label="Open" value={data.counts.open} />
              <Stat label="In progress" value={data.counts.inProgress} />
              <Stat label="In review" value={data.counts.inReview} />
              <Stat label="Blocked" value={data.counts.blocked} alert />
              <Stat label="Overdue" value={data.counts.overdue} alert />
              <Stat label="Completed" value={data.counts.completed} />
            </div>
            {nothing ? (
              <div className="panel"><Empty title="Nothing on the fire yet" hint="Create the first ticket, or ask to be added to a group." action={can("tickets.create") ? <Link href="/tickets" className="link-button">Go to tickets →</Link> : undefined} /></div>
            ) : <>
              <Section title="Overdue" hint="Past their due date and still open." tickets={data.overdue} href="/tickets" linkLabel="All tickets" />
              <Section title="Due this week" tickets={data.dueSoon} />
              <Section title="Assigned to you" tickets={assigned} href="/my-work" linkLabel="View all" />
              <Section title="Recently updated" hint="Across the groups you belong to." tickets={data.recent} href="/tickets" linkLabel="All tickets" />
            </>}
          </>}
        </>}
    </>
  );
}
