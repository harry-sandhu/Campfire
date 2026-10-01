"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, apiBlob, json } from "../lib/api";
import { assigneesOf, label } from "../lib/format";
import { useDebounce } from "../lib/use-debounce";
import { useLoad } from "../lib/use-load";
import { PRIORITIES, STATUSES, type Group, type Member, type Milestone, type SavedFilter, type Ticket, type TicketPage } from "../lib/types";
import { useAuth } from "./auth-provider";
import { ImportModal } from "./import-modal";
import { ConfirmDialog, Modal } from "./modal";
import { useLiveEvents } from "./realtime";
import { PageHeader } from "./shell";
import { TicketForm } from "./ticket-form";
import { useToast } from "./toast";
import { Empty, ErrorNote, PriorityPill, Spinner, TicketRow } from "./ui";

const FILTER_KEYS = ["q", "status", "priority", "group", "milestone", "view"] as const;

export function TicketsView({ mine = false }: { mine?: boolean }) {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkPeople, setBulkPeople] = useState<Member[]>([]);
  const debounced = useDebounce(search);

  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  const groupId = params.get("group") ?? "";
  const milestoneId = params.get("milestone") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const view = params.get("view") === "board" ? "board" : "list";

  const setParams = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    if (!keepPage) next.delete("page");
    router.replace(`?${next.toString()}`);
  };

  useEffect(() => {
    if (debounced !== (params.get("q") ?? "")) setParams({ q: debounced });
    // eslint-disable-next-line
  }, [debounced]);

  useEffect(() => {
    api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined);
    api<{ filters: SavedFilter[] }>("/saved-filters").then((d) => setSaved(d.filters)).catch(() => undefined);
  }, []);

  useEffect(() => {
    setMilestones([]);
    if (groupId) api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`).then((d) => setMilestones(d.milestones)).catch(() => undefined);
  }, [groupId]);

  const { data, error, loading, reload, refresh, setData } = useLoad(() => {
    const query = new URLSearchParams({ limit: view === "board" ? "50" : "20", page: String(page) });
    const q = params.get("q");
    if (q) query.set("search", q);
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    if (groupId) query.set("groupId", groupId);
    if (milestoneId) query.set("milestoneId", milestoneId);
    if (mine) query.set("mine", "true");
    return api<TicketPage>(`/tickets?${query}`);
  }, [params.toString(), mine]);

  useLiveEvents((event) => { if (event.type.startsWith("ticket.") || event.type === "comment.created") refresh(); });
  useEffect(() => setSelected([]), [params.toString()]);

  const currentQuery = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, k === "q" ? params.get("q") ?? "" : params.get(k) ?? ""]).filter(([, v]) => v)), [params]);
  const activeSaved = saved.find((s) => JSON.stringify(s.query) === JSON.stringify(currentQuery));

  const selectedTickets = (data?.tickets ?? []).filter((t) => selected.includes(t.id));
  const selectedGroups = new Set(selectedTickets.map((t) => t.groupId?._id ?? ""));
  const singleGroup = selectedGroups.size === 1 ? [...selectedGroups][0] : "";

  useEffect(() => {
    setBulkPeople([]);
    if (singleGroup && can("tickets.assign")) api<{ members: Member[] }>(`/groups/${singleGroup}`).then((d) => setBulkPeople(d.members)).catch(() => undefined);
  }, [singleGroup, can]);

  async function bulk(action: string, value: string | null, message: string) {
    try {
      const res = await api<{ succeeded: number; failed: number; results: { ok: boolean; error?: string }[] }>("/tickets/bulk", { method: "POST", body: json({ ids: selected, action, value }) });
      toast(res.failed ? `${message}: ${res.succeeded} done, ${res.failed} failed (${res.results.find((r) => !r.ok)?.error})` : `${message}: ${res.succeeded} tickets`, res.failed ? "error" : "success");
      setSelected([]);
      reload();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function exportCsv() {
    try {
      const query = new URLSearchParams();
      if (params.get("q")) query.set("search", params.get("q")!);
      if (status) query.set("status", status);
      if (priority) query.set("priority", priority);
      if (groupId) query.set("groupId", groupId);
      if (milestoneId) query.set("milestoneId", milestoneId);
      if (mine) query.set("mine", "true");
      const blob = await apiBlob(`/tickets/export?${query}`);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), { href: url, download: "tickets.csv" });
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function moveCard(ticket: Ticket, next: string) {
    if (ticket.status === next || !can("tickets.change_status")) return;
    const previous = data;
    setData((d) => d && { ...d, tickets: d.tickets.map((t) => (t.id === ticket.id ? { ...t, status: next as Ticket["status"] } : t)) });
    try { await api(`/tickets/${ticket.id}`, { method: "PATCH", body: json({ status: next }) }); }
    catch (e) { setData(previous); toast((e as Error).message, "error"); }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = !!data?.tickets.length && selected.length === data.tickets.length;

  return (
    <>
      <PageHeader title={mine ? "My work" : "Tickets"}>
        <button type="button" className="ghost" onClick={() => void exportCsv()}>Export CSV</button>
        {can("tickets.create") && <button type="button" className="ghost" onClick={() => setShowImport(true)}>Import CSV</button>}
        {can("tickets.create") && <button onClick={() => setShowCreate(true)}>+ New ticket</button>}
      </PageHeader>
      <section className="panel">
        <div className="filters">
          <input className="search" type="search" aria-label="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets…" />
          <select aria-label="Status" value={status} onChange={(e) => setParams({ status: e.target.value })}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <select aria-label="Priority" value={priority} onChange={(e) => setParams({ priority: e.target.value })}><option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>
          <select aria-label="Group" value={groupId} onChange={(e) => setParams({ group: e.target.value, milestone: "" })}><option value="">All groups</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          {milestones.length > 0 && <select aria-label="Milestone" value={milestoneId} onChange={(e) => setParams({ milestone: e.target.value })}><option value="">Any milestone</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
          <div className="segmented" role="group" aria-label="View">
            <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setParams({ view: "" })}>List</button>
            <button type="button" className={view === "board" ? "on" : ""} aria-pressed={view === "board"} onClick={() => setParams({ view: "board" })}>Board</button>
          </div>
        </div>
        <div className="filters saved-views">
          <select aria-label="Saved views" value={activeSaved?.id ?? ""} onChange={(e) => { const f = saved.find((s) => s.id === e.target.value); if (f) { setSearch(f.query.q ?? ""); router.replace(`?${new URLSearchParams(f.query).toString()}`); } }}>
            <option value="">Saved views…</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!activeSaved && Object.keys(currentQuery).length > 0 && <button type="button" className="link-button" onClick={() => setSaving(true)}>Save this view</button>}
          {activeSaved && <button type="button" className="link-button danger-text" onClick={async () => { await api(`/saved-filters/${activeSaved.id}`, { method: "DELETE" }); setSaved((s) => s.filter((x) => x.id !== activeSaved.id)); toast("View deleted"); }}>Delete view</button>}
        </div>

        {selected.length > 0 && (
          <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
            <strong>{selected.length} selected</strong>
            {can("tickets.change_status") && <select aria-label="Set status" value="" onChange={(e) => e.target.value && void bulk("status", e.target.value, "Status updated")}><option value="">Set status…</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}
            {can("tickets.change_priority") && <select aria-label="Set priority" value="" onChange={(e) => e.target.value && void bulk("priority", e.target.value, "Priority updated")}><option value="">Set priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>}
            {bulkPeople.length > 0 && <select aria-label="Assign to" value="" onChange={(e) => e.target.value && void bulk("assign", e.target.value, "Assigned")}><option value="">Assign to…</option>{bulkPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            {can("tickets.edit") && <select aria-label="Move to group" value="" onChange={(e) => e.target.value && void bulk("move", e.target.value === "none" ? null : e.target.value, "Moved")}><option value="">Move to group…</option><option value="none">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
            {can("tickets.delete") && <button type="button" className="ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete</button>}
            <button type="button" className="ghost" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}

        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : !data?.tickets.length ? (
          <Empty title="No tickets found" hint="Try different filters, or create a new ticket." />
        ) : view === "board" ? (
          <>
            <div className="board">
              {STATUSES.map((s) => {
                const items = data.tickets.filter((t) => t.status === s);
                return (
                  <div className="column" key={s} onDragOver={(e) => can("tickets.change_status") && e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); const t = data.tickets.find((x) => x.id === id); if (t) void moveCard(t, s); }}>
                    <h3>{label(s)} <span className="count">{items.length}</span></h3>
                    {items.map((t) => (
                      <Link className="card" key={t.id} href={`/tickets/${t.id}`} draggable={can("tickets.change_status")} onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}>
                        <span className="ticket-id">{t.ticketNumber}</span>
                        <strong>{t.title}</strong>
                        <span className="card-foot"><PriorityPill priority={t.priority} /><span className="assignee">{assigneesOf(t).map((p) => p.name.split(" ")[0]).join(", ")}</span></span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="muted note">{can("tickets.change_status") ? "Drag cards between columns to change status. " : ""}{data.total > data.tickets.length ? `Showing the ${data.tickets.length} most recently updated of ${data.total} tickets.` : ""}</p>
          </>
        ) : (
          <>
            <div className="select-all"><label className="check"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : data.tickets.map((t) => t.id))} />Select all on this page</label></div>
            <div className="ticket-list" aria-busy={loading}>
              {data.tickets.map((t) => (
                <div className="ticket-line" key={t.id}>
                  <input type="checkbox" aria-label={`Select ${t.ticketNumber}`} checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                  <TicketRow ticket={t} />
                </div>
              ))}
            </div>
            <div className="pager">
              <button type="button" className="ghost" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, true)}>← Previous</button>
              <span className="muted">Page {data.page} of {Math.max(data.pages, 1)} · {data.total} tickets</span>
              <button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setParams({ page: String(page + 1) }, true)}>Next →</button>
            </div>
          </>
        )}
      </section>
      {showCreate && <TicketForm defaultGroupId={groupId} onClose={() => { setShowCreate(false); reload(); }} />}
      {showImport && <ImportModal groups={groups} defaultGroupId={groupId} onClose={() => setShowImport(false)} onDone={reload} />}
      {confirmDelete && <ConfirmDialog title="Delete tickets" message={`Delete ${selected.length} selected tickets? A SuperAdmin can restore them from Data management.`} confirmLabel="Delete" onClose={() => setConfirmDelete(false)} onConfirm={() => bulk("delete", null, "Deleted")} />}
      {saving && (
        <Modal title="Save this view" onClose={() => setSaving(false)}>
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name")).trim(); if (!name) return; try { const f = await api<SavedFilter>("/saved-filters", { method: "POST", body: json({ name, query: currentQuery }) }); setSaved((s) => [...s, f]); setSaving(false); toast("View saved"); } catch (err) { toast((err as Error).message, "error"); } }}>
            <label>Name<input name="name" required maxLength={60} placeholder="Urgent in Ops" /></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setSaving(false)}>Cancel</button><button>Save view</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
