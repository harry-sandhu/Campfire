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

type Dashboard = { counts: { open: number; inProgress: number; inReview: number; waiting: number; blocked: number; completed: number; overdue: number }; overdue: Ticket[]; dueSoon: Ticket[]; mine: Ticket[]; recent: Ticket[] };

function Section({ title, hint, href, linkLabel, tickets, tone }: { title: string; hint?: string; href?: string; linkLabel?: string; tickets: Ticket[]; tone?: string }) {
  if (!tickets.length) return null;
  return (
    <section>
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">{tone && <i className="size-2.5 rounded-full" style={{ background: tone }} aria-hidden="true" />}{title}<span className="rounded-full bg-soft px-2 text-xs font-semibold text-muted">{tickets.length}</span></h2>
          {hint && <p className="text-[13px] text-muted">{hint}</p>}
        </div>
        {href && <Link href={href} className="text-[13px] font-semibold text-accent hover:underline">{linkLabel} →</Link>}
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">{tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}</div>
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
            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Open" value={data.counts.open} href="/tickets?status=OPEN" />
              <Stat label="In progress" value={data.counts.inProgress} tone="progress" href="/tickets?status=IN_PROGRESS" />
              <Stat label="In review" value={data.counts.inReview} tone="review" href="/tickets?status=IN_REVIEW" />
              <Stat label="Waiting" value={data.counts.waiting} tone="review" href="/tickets?status=WAITING" />
              <Stat label="Blocked" value={data.counts.blocked} tone="blocked" alert href="/tickets?status=BLOCKED" />
              <Stat label="Overdue" value={data.counts.overdue} tone="overdue" alert />
              <Stat label="Completed" value={data.counts.completed} tone="done" href="/tickets?status=COMPLETED" />
            </div>
            {nothing ? (
              <div className="rounded-lg border border-line bg-card shadow-sm"><Empty title="Nothing on the fire yet" hint="Create the first ticket, or ask to be added to a group." action={can("tickets.create") ? <Link href="/tickets" className="text-sm font-semibold text-accent hover:underline">Go to tickets →</Link> : undefined} /></div>
            ) : <div className="grid gap-8">
              <Section title="Overdue" hint="Past their due date and still open." tickets={data.overdue} tone="var(--s-blocked)" href="/tickets" linkLabel="All tickets" />
              <Section title="Due this week" tone="var(--s-progress)" tickets={data.dueSoon} />
              <Section title="Assigned to you" tickets={assigned} tone="var(--s-review)" href="/my-work" linkLabel="View all" />
              <Section title="Recently updated" hint="Across the groups you belong to." tickets={data.recent} href="/tickets" linkLabel="All tickets" />
            </div>}
          </>}
        </>}
    </>
  );
}
