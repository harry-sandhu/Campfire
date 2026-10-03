"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "../lib/api";
import { formatDate, label } from "../lib/format";
import { useLoad } from "../lib/use-load";
import { STATUSES, type Group, type PersonRow, type PersonTicket } from "../lib/types";
import { Avatar, Empty, ErrorNote, Skeleton } from "./ui";
import { Badge, Button, fieldClass } from "./controls";

type SortKey = "name" | "assigned" | "completed" | "overdue" | "completionRate" | "onTimeRate" | "avgDaysToComplete";
const COLUMNS: { key: SortKey; text: string; numeric?: boolean }[] = [
  { key: "name", text: "Person" }, { key: "assigned", text: "Assigned", numeric: true }, { key: "completed", text: "Done", numeric: true }, { key: "overdue", text: "Overdue", numeric: true },
  { key: "completionRate", text: "Completion", numeric: true }, { key: "onTimeRate", text: "On time", numeric: true }, { key: "avgDaysToComplete", text: "Avg days", numeric: true },
];

const card = "overflow-hidden rounded-lg border border-line bg-card shadow-sm";

export function PeopleReport({ groups, initialPerson }: { groups: Group[]; initialPerson: string }) {
  const [person, setPerson] = useState(initialPerson);
  return person ? <PersonDetail userId={person} groups={groups} onBack={() => setPerson("")} /> : <PeopleTable onOpen={setPerson} />;
}

function PeopleTable({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, error, loading } = useLoad(() => api<{ people: PersonRow[] }>("/reports/people"), []);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "assigned", dir: -1 });
  const rows = [...(data?.people ?? [])].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x === y) return 0;
    if (x === null) return 1; // missing values always sort last
    if (y === null) return -1;
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
  });
  const th = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted";
  return (
    <>
      <ErrorNote message={error} />
      {loading && !data ? <Skeleton rows={5} /> : !rows.length ? <div className={card}><Empty title="No assigned tickets yet" hint="Once tickets are assigned, you will see who has done what." /></div> : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="border-b border-line bg-soft"><tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`${th} ${c.numeric ? "text-right" : ""}`} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" className="border-0 bg-transparent p-0 font-[inherit] uppercase tracking-[inherit] text-inherit hover:text-ink" onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : c.key === "name" ? 1 : -1 })}>{c.text}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="cursor-pointer border-b border-line last:border-0 hover:bg-hover" onClick={() => onOpen(r.userId)}>
                  <td className="px-3 py-3"><button type="button" className="flex items-center gap-2.5 border-0 bg-transparent p-0 text-left" onClick={(e) => { e.stopPropagation(); onOpen(r.userId); }}><Avatar name={r.name} size={30} /><span><strong className="block">{r.name}{!r.active && <span className="ml-2 text-xs font-normal text-muted">inactive</span>}</strong>{r.leftGroup > 0 && <small className="text-muted">{r.leftGroup} in groups they left</small>}</span></button></td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.assigned}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.completed}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${r.overdue ? "font-semibold text-danger" : ""}`}>{r.overdue}</td>
                  <td className="px-3 py-3"><div className="ml-auto flex w-32 items-center justify-end gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-soft" role="progressbar" aria-label={`${r.name} completion`} aria-valuenow={r.completionRate} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-pine" style={{ width: `${r.completionRate}%` }} /></span><span className="w-9 text-right tabular-nums">{r.completionRate}%</span></div></td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.onTimeRate === null ? "—" : `${r.onTimeRate}%`}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.avgDaysToComplete ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[13px] text-muted">Counts every ticket ever assigned to the person in groups you lead, including groups they have since left. “Done” means Completed or Closed; “On time” compares completion to the due date.</p>
    </>
  );
}

function PersonDetail({ userId, groups, onBack }: { userId: string; groups: Group[]; onBack: () => void }) {
  const [groupId, setGroupId] = useState("");
  const [status, setStatus] = useState("");
  const [days, setDays] = useState("");
  const query = new URLSearchParams();
  if (groupId) query.set("groupId", groupId);
  if (status) query.set("status", status);
  if (days) query.set("days", days);
  const { data, error, loading } = useLoad(() => api<{ user: { id: string; name: string; email: string; active: boolean } | null; tickets: PersonTicket[] }>(`/reports/people/${userId}?${query}`), [userId, groupId, status, days]);
  const select = `${fieldClass.replace("w-full", "")} h-9 w-auto py-0`;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>← All people</Button>
        {data?.user && <h2 className="flex items-center gap-2.5 text-lg font-semibold"><Avatar name={data.user.name} size={32} />{data.user.name}<span className="text-sm font-normal text-muted">{data.user.email}</span></h2>}
        <div className="ml-auto flex flex-wrap gap-2">
          <select className={select} aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">All groups</option><option value="none">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select className={select} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <select className={select} aria-label="Assigned within" value={days} onChange={(e) => setDays(e.target.value)}><option value="">Any time</option>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>Created in the last {d} days</option>)}</select>
        </div>
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Skeleton rows={5} /> : !data?.tickets.length ? <div className={card}><Empty title="No tickets match" hint="Try a different group, status or time range." /></div> : (
        <div className={card}>
          {data.tickets.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-hover">
              <span className="w-16 shrink-0 font-mono text-xs text-muted">{t.ticketNumber}</span>
              <span className="min-w-48 flex-1 font-semibold">{t.title}</span>
              <Badge tone={["COMPLETED", "CLOSED"].includes(t.status) ? "success" : t.overdue ? "danger" : "neutral"}>{label(t.status)}</Badge>
              {t.overdue && <Badge tone="danger">Overdue</Badge>}
              {t.onTime === false && <Badge tone="danger">Finished late</Badge>}
              {t.leftGroup && <Badge>Left group</Badge>}
              <span className="text-[13px] text-muted">{t.groupName ?? "No group"} · assigned {formatDate(t.assignedAt)}{t.dueDate ? ` · due ${formatDate(t.dueDate)}` : ""}{t.completedAt ? ` · done ${formatDate(t.completedAt)}` : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
