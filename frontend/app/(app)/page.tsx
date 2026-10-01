"use client";
import Link from "next/link";
import { useAuth } from "../../components/auth-provider";
import { PageHeader } from "../../components/shell";
import { Empty, ErrorNote, Spinner, Stat, TicketRow } from "../../components/ui";
import { api } from "../../lib/api";
import { greeting } from "../../lib/format";
import { useLoad } from "../../lib/use-load";
import type { Ticket } from "../../lib/types";

type Dashboard = { counts: { open: number; inProgress: number; inReview: number; blocked: number; completed: number; overdue: number }; mine: Ticket[]; recent: Ticket[] };

export default function OverviewPage() {
  const { user, can } = useAuth();
  const allowed = can("tickets.view");
  const { data, error, loading } = useLoad(() => (allowed ? api<Dashboard>("/dashboard") : Promise.resolve(null)), [allowed]);

  return (
    <>
      <PageHeader title={`${greeting()}, ${user!.name.split(" ")[0]}`} />
      {!allowed ? <Empty title="No ticket access yet" hint="Ask an administrator for the tickets.view permission." />
        : loading && !data ? <Spinner />
        : <>
          <ErrorNote message={error} />
          {data && <>
            <div className="stats">
              <Stat label="Open" value={data.counts.open} tone="blue" />
              <Stat label="In progress" value={data.counts.inProgress} tone="amber" />
              <Stat label="Blocked" value={data.counts.blocked} tone="red" />
              <Stat label="Overdue" value={data.counts.overdue} tone="red" />
              <Stat label="Completed" value={data.counts.completed} tone="green" />
            </div>
            <section className="panel">
              <div className="panel-head"><div><h2>Assigned to me</h2><p className="muted">Your active work.</p></div><Link href="/my-work" className="link-button">View all</Link></div>
              {data.mine.length ? data.mine.map((t) => <TicketRow key={t.id} ticket={t} />) : <Empty title="Nothing assigned to you" />}
            </section>
            <section className="panel spaced">
              <div className="panel-head"><div><h2>Recently updated</h2><p className="muted">Across the groups you belong to.</p></div><Link href="/tickets" className="link-button">All tickets</Link></div>
              {data.recent.length ? data.recent.map((t) => <TicketRow key={t.id} ticket={t} />) : <Empty title="No tickets yet" hint="Create one from the Tickets page." />}
            </section>
          </>}
        </>}
    </>
  );
}
