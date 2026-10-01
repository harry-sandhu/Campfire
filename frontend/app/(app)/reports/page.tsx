"use client";
import { useEffect, useState } from "react";
import { fieldClass } from "../../../components/controls";
import { PageHeader } from "../../../components/shell";
import { Empty, ErrorNote, Skeleton, Stat, statusColor } from "../../../components/ui";
import { api } from "../../../lib/api";
import { label } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import { STATUSES, type Group } from "../../../lib/types";

type Report = {
  byStatus: Record<string, number>; byPriority: Record<string, number>; byAssignee: { name: string; count: number }[]; byGroup: { name: string; count: number }[];
  series: { week: string; created: number; completed: number }[]; overdue: number; avgLeadTimeDays: number | null; completedInRange: number; days: number;
};

/** Horizontal bars with the value printed on the right, so the chart reads without a legend. */
function Bars({ rows, tone = "var(--chart-1)" }: { rows: { name: string; value: number; color?: string }[]; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-muted">Nothing to show.</p>;
  return (
    <ul className="mt-3 grid list-none gap-3 p-0">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-[13px]">
          <span className="truncate">{r.name}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-soft"><span className="block h-full min-w-0.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? tone }} /></span>
          <span className="text-right font-semibold tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Throughput({ series }: { series: Report["series"] }) {
  const max = Math.max(1, ...series.flatMap((s) => [s.created, s.completed]));
  const h = 140, w = 520, step = w / series.length;
  return (
    <figure className="m-0 mt-3">
      <svg className="mx-auto h-auto max-h-56 w-full" viewBox={`0 0 ${w} ${h + 28}`} role="img" aria-label="Tickets created and completed per week for the last 12 weeks">
        {series.map((s, i) => {
          const x = i * step + step * 0.12, bw = step * 0.36;
          return (
            <g key={s.week}>
              <rect x={x} y={h - (s.created / max) * h} width={bw} height={(s.created / max) * h} rx="2" fill="var(--chart-1)"><title>{`${s.week}: ${s.created} created`}</title></rect>
              <rect x={x + bw + 2} y={h - (s.completed / max) * h} width={bw} height={(s.completed / max) * h} rx="2" fill="var(--chart-2)"><title>{`${s.week}: ${s.completed} completed`}</title></rect>
              {i % 2 === 0 && <text x={x + bw} y={h + 16} fontSize="9" textAnchor="middle" fill="var(--muted)">{s.week.slice(-3)}</text>}
            </g>
          );
        })}
        <line x1="0" x2={w} y1={h} y2={h} stroke="var(--line)" />
      </svg>
      <figcaption className="mt-2 flex items-center gap-4 text-xs"><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: "var(--chart-1)" }} />Created</span><span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: "var(--chart-2)" }} />Completed</span><span className="text-muted">per ISO week</span></figcaption>
    </figure>
  );
}

export default function ReportsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [days, setDays] = useState(90);
  const { data, error, loading } = useLoad(() => api<Report>(`/reports?days=${days}${groupId ? `&groupId=${groupId}` : ""}`), [groupId, days]);

  useEffect(() => { api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined); }, []);

  const total = data ? Object.values(data.byStatus).reduce((a, b) => a + b, 0) : 0;

  const select = `${fieldClass.replace("w-full", "")} h-9 w-auto py-0`;
  const card = "rounded-lg border border-line bg-card p-5 shadow-sm";
  return (
    <>
      <PageHeader title="Reports" eyebrow="Insight">
        <select className={select} aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">All my groups</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select className={select} aria-label="Range" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
      </PageHeader>
      <ErrorNote message={error} />
      {loading && !data ? <Skeleton rows={6} /> : data && (total === 0 ? <div className={card}><Empty title="No tickets to report on yet" /></div> : <>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tickets" value={total} />
          <Stat label="Overdue" value={data.overdue} tone="overdue" alert />
          <Stat label={`Completed (${data.days}d)`} value={data.completedInRange} tone="done" />
          <Stat label="Avg. days to complete" value={data.avgLeadTimeDays ?? "—"} tone="review" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${card} lg:col-span-2`}><h2 className="text-base font-semibold">Throughput</h2><Throughput series={data.series} /></section>
          <section className={card}><h2 className="text-base font-semibold">By status</h2><Bars rows={STATUSES.map((s) => ({ name: label(s), value: data.byStatus[s] ?? 0, color: statusColor(s) }))} /></section>
          <section className={card}><h2 className="text-base font-semibold">Open by priority</h2><Bars rows={["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"].map((p) => ({ name: label(p), value: data.byPriority[p] ?? 0, color: p === "URGENT" ? "var(--p-urgent)" : p === "HIGH" ? "var(--p-high)" : "var(--s-open)" }))} /></section>
          <section className={card}><h2 className="text-base font-semibold">Open by assignee</h2><Bars tone="var(--chart-2)" rows={data.byAssignee.map((a) => ({ name: a.name, value: a.count }))} /></section>
          <section className={card}><h2 className="text-base font-semibold">Open by group</h2><Bars rows={data.byGroup.map((g) => ({ name: g.name, value: g.count }))} /></section>
        </div>
      </>)}
    </>
  );
}
