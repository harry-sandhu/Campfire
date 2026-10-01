"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { assigneesOf, label } from "../lib/format";
import { useDebounce } from "../lib/use-debounce";
import { useLoad } from "../lib/use-load";
import { PRIORITIES, STATUSES, type Group, type TicketPage } from "../lib/types";
import { useAuth } from "./auth-provider";
import { PageHeader } from "./shell";
import { TicketForm } from "./ticket-form";
import { Empty, ErrorNote, PriorityPill, Spinner, TicketRow } from "./ui";

export function TicketsView({ mine = false }: { mine?: boolean }) {
  const { can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const debounced = useDebounce(search);

  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  const groupId = params.get("group") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const view = params.get("view") === "board" ? "board" : "list";

  const setParam = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    if (!("page" in changes)) next.delete("page");
    router.replace(`?${next.toString()}`);
  };

  useEffect(() => {
    if (debounced !== (params.get("q") ?? "")) setParam({ q: debounced });
    // eslint-disable-next-line
  }, [debounced]);

  useEffect(() => {
    api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined);
  }, []);

  const { data, error, loading, reload } = useLoad(() => {
    const query = new URLSearchParams({ limit: view === "board" ? "50" : "20", page: String(page) });
    const q = params.get("q");
    if (q) query.set("search", q);
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    if (groupId) query.set("groupId", groupId);
    if (mine) query.set("mine", "true");
    return api<TicketPage>(`/tickets?${query}`);
  }, [params.toString(), mine]);

  return (
    <>
      <PageHeader title={mine ? "My work" : "Tickets"}>
        {can("tickets.create") && <button onClick={() => setShowCreate(true)}>+ New ticket</button>}
      </PageHeader>
      <section className="panel">
        <div className="filters">
          <input className="search" type="search" aria-label="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets…" />
          <select aria-label="Status" value={status} onChange={(e) => setParam({ status: e.target.value })}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <select aria-label="Priority" value={priority} onChange={(e) => setParam({ priority: e.target.value })}><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>
          <select aria-label="Group" value={groupId} onChange={(e) => setParam({ group: e.target.value })}><option value="">All groups</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <div className="segmented" role="group" aria-label="View">
            <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setParam({ view: "" })}>List</button>
            <button type="button" className={view === "board" ? "on" : ""} aria-pressed={view === "board"} onClick={() => setParam({ view: "board" })}>Board</button>
          </div>
        </div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : !data?.tickets.length ? (
          <Empty title="No tickets found" hint="Try different filters, or create a new ticket." />
        ) : view === "board" ? (
          <>
            <div className="board">
              {STATUSES.map((s) => {
                const items = data.tickets.filter((t) => t.status === s);
                return (
                  <div className="column" key={s}>
                    <h3>{label(s)} <span className="count">{items.length}</span></h3>
                    {items.map((t) => (
                      <Link className="card" key={t.id} href={`/tickets/${t.id}`}>
                        <span className="ticket-id">{t.ticketNumber}</span>
                        <strong>{t.title}</strong>
                        <span className="card-foot"><PriorityPill priority={t.priority} /><span className="assignee">{assigneesOf(t).map((p) => p.name.split(" ")[0]).join(", ")}</span></span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
            {data.total > data.tickets.length && <p className="muted note">Showing the {data.tickets.length} most recently updated of {data.total} tickets. Use filters or list view to see the rest.</p>}
          </>
        ) : (
          <>
            <div className="ticket-list" aria-busy={loading}>{data.tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}</div>
            <div className="pager">
              <button type="button" className="ghost" disabled={page <= 1} onClick={() => setParam({ page: String(page - 1) })}>← Previous</button>
              <span className="muted">Page {data.page} of {Math.max(data.pages, 1)} · {data.total} tickets</span>
              <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setParam({ page: String(page + 1) })}>Next →</button>
            </div>
          </>
        )}
      </section>
      {showCreate && <TicketForm defaultGroupId={groupId} onClose={() => { setShowCreate(false); reload(); }} />}
    </>
  );
}
