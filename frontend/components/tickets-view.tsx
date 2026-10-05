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
import { Button, fieldClass, panelClass } from "./controls";
import { BoardIcon, ListIcon, PlusIcon, SearchIcon } from "./icons";
import { AvatarStack, Empty, ErrorNote, PriorityPill, Skeleton, statusColor, TicketRow } from "./ui";
import { ImportModal } from "./import-modal";
import { MultiFilter, listParam } from "./multi-filter";
import { ConfirmDialog, Modal } from "./modal";
import { useLiveEvents } from "./realtime";
import { PageHeader } from "./shell";
import { TicketForm } from "./ticket-form";
import { useToast } from "./toast";

const FILTER_KEYS = ["q", "status", "statusNot", "priority", "priorityNot", "group", "scope", "milestone", "milestoneNot", "assignee", "assigneeNot", "view"] as const;

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
  const [bulkMilestones, setBulkMilestones] = useState<Milestone[]>([]);
  const [dropTarget, setDropTarget] = useState("");
  const debounced = useDebounce(search);

  // status, priority, milestone and assignee each take one or more values, and "Not" flips them to "is none of"
  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  const groupId = params.get("group") ?? "";
  const milestoneId = params.get("milestone") ?? "";
  const assignee = params.get("assignee") ?? "";
  const statusNot = params.get("statusNot") === "true";
  const priorityNot = params.get("priorityNot") === "true";
  const milestoneNot = params.get("milestoneNot") === "true";
  const assigneeNot = params.get("assigneeNot") === "true";
  const inGroup = !!groupId && groupId !== "none";
  const showAll = params.get("scope") === "all";
  const onlyMine = mine || (inGroup && !showAll);
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

  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  useEffect(() => {
    setGroupMembers([]);
    if (inGroup) api<{ members: Member[] }>(`/groups/${groupId}`).then((d) => setGroupMembers(d.members)).catch(() => undefined);
    else if (can("tickets.assign")) api<{ users: Member[] }>("/users/assignees").then((d) => setGroupMembers(d.users)).catch(() => undefined);
  }, [groupId, can]);

  useEffect(() => {
    setMilestones([]);
    if (inGroup) api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`).then((d) => setMilestones(d.milestones)).catch(() => undefined);
  }, [groupId]);

  const queryFor = (extra: Record<string, string> = {}) => {
    const query = new URLSearchParams(extra);
    if (params.get("q")) query.set("search", params.get("q")!);
    if (status) { query.set("status", status); if (statusNot) query.set("statusNot", "true"); }
    if (priority) { query.set("priority", priority); if (priorityNot) query.set("priorityNot", "true"); }
    if (groupId) query.set("groupId", groupId);
    if (milestoneId) { query.set("milestoneId", milestoneId); if (milestoneNot) query.set("milestoneNot", "true"); }
    if (assignee) { query.set("assigneeId", assignee); if (assigneeNot) query.set("assigneeNot", "true"); }
    if (onlyMine) query.set("mine", "true");
    return query;
  };

  const { data, error, loading, reload, refresh, setData } = useLoad(() => api<TicketPage>(`/tickets?${queryFor({ limit: view === "board" ? "50" : "20", page: String(page) })}`), [params.toString(), onlyMine]);

  useLiveEvents((event) => { if (event.type.startsWith("ticket.") || event.type === "comment.created") refresh(); });
  useEffect(() => setSelected([]), [params.toString()]);

  // an "is not" switch with nothing picked yet is not a filter, so it is left out of saved views and the "filters active" check
  const currentQuery = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""]).filter(([k, v]) => v && !(k.endsWith("Not") && !params.get(k.slice(0, -3))))), [params]);
  const activeSaved = saved.find((s) => JSON.stringify(s.query) === JSON.stringify(currentQuery));
  const hasFilters = Object.keys(currentQuery).some((k) => k !== "view" && k !== "group" && k !== "scope");

  const selectedTickets = (data?.tickets ?? []).filter((t) => selected.includes(t.id));
  const selectedGroups = new Set(selectedTickets.map((t) => t.groupId?._id ?? ""));
  const singleGroup = selectedGroups.size === 1 ? [...selectedGroups][0] : "";

  useEffect(() => {
    setBulkPeople([]);
    if (singleGroup && can("tickets.assign")) api<{ members: Member[] }>(`/groups/${singleGroup}`).then((d) => setBulkPeople(d.members)).catch(() => undefined);
  }, [singleGroup, can]);

  useEffect(() => {
    setBulkMilestones([]);
    if (singleGroup && can("tickets.edit")) api<{ milestones: Milestone[] }>(`/groups/${singleGroup}/milestones`).then((d) => setBulkMilestones(d.milestones.filter((m) => !m.closedAt))).catch(() => undefined);
  }, [singleGroup, can]);

  async function bulk(action: string, value: string | null, message: string) {
    const ids = selected;
    try {
      const res = await api<{ succeeded: number; failed: number; results: { ok: boolean; error?: string }[] }>("/tickets/bulk", { method: "POST", body: json({ ids, action, value }) });
      if (res.failed) toast(`${message}: ${res.succeeded} done, ${res.failed} failed (${res.results.find((r) => !r.ok)?.error})`, "error");
      else if (action === "delete") toast(`Deleted ${res.succeeded} tickets`, "success", { label: "Undo", run: async () => { await api("/tickets/restore", { method: "POST", body: json({ ids }) }); reload(); } });
      else toast(`${message}: ${res.succeeded} tickets`);
      setSelected([]);
      reload();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function exportCsv() {
    try {
      const blob = await apiBlob(`/tickets/export?${queryFor()}`);
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: "tickets.csv" }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function moveCard(ticket: Ticket, next: string) {
    if (ticket.status === next || !can("tickets.change_status")) return;
    const previous = ticket.status;
    setData((d) => d && { ...d, tickets: d.tickets.map((t) => (t.id === ticket.id ? { ...t, status: next as Ticket["status"] } : t)) });
    try {
      await api(`/tickets/${ticket.id}`, { method: "PATCH", body: json({ status: next }) });
      toast(`${ticket.ticketNumber} moved to ${label(next).toLowerCase()}`, "success", { label: "Undo", run: async () => { await api(`/tickets/${ticket.id}`, { method: "PATCH", body: json({ status: previous }) }); reload(); } });
    } catch (e) { reload(); toast((e as Error).message, "error"); }
  }

  async function quickAdd(statusName: string, title: string) {
    try {
      const created = await api<{ id: string }>("/tickets", { method: "POST", body: json({ title, groupId: inGroup ? groupId : null, topicIds: [] }) });
      if (statusName !== "OPEN" && can("tickets.change_status")) await api(`/tickets/${created.id}`, { method: "PATCH", body: json({ status: statusName }) });
      toast("Ticket added");
      reload();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = !!data?.tickets.length && selected.length === data.tickets.length;

  const selectCls = `${fieldClass.replace("w-full", "")} h-9 w-auto min-w-0 py-0 pr-8`;
  const checkCls = "size-4 shrink-0 cursor-pointer rounded accent-[var(--accent)]";

  return (
    <>
      <PageHeader title={mine ? "My work" : "Tickets"} eyebrow={mine ? "Assigned to you" : undefined}>
        <Button variant="ghost" onClick={() => void exportCsv()}>Export CSV</Button>
        {can("tickets.create") && <Button variant="ghost" onClick={() => setShowImport(true)}>Import CSV</Button>}
        {can("tickets.create") && <Button onClick={() => setShowCreate(true)}><PlusIcon size={16} />New ticket</Button>}
      </PageHeader>
      <section className={`${panelClass} overflow-hidden`}>
        {!mine && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 md:px-4" role="group" aria-label="Section">
            {([["", "All tickets"], ["none", "No group"], ...groups.map((g) => [g.id, g.name])] as [string, string][]).map(([id, text]) => (
              <button key={id || "all"} type="button" aria-pressed={groupId === id} className={`h-8 max-w-[220px] truncate rounded-full border px-3 text-[13px] font-semibold transition ${groupId === id ? "border-accent bg-accent-soft text-ink" : "border-line bg-card text-muted hover:text-ink"}`} onClick={() => setParams({ group: id, scope: "", milestone: "" })}>{text}</button>
            ))}
            {inGroup && (
              <div className="ml-auto inline-flex rounded-lg border border-line-strong bg-soft p-0.5" role="group" aria-label="Scope">
                {([["", "Assigned to me"], ["all", "Everything in group"]] as const).map(([key, text]) => (
                  <button key={key} type="button" aria-pressed={showAll === !!key} className={`inline-flex h-8 items-center rounded-md border-0 px-3 text-[13px] font-semibold transition ${showAll === !!key ? "bg-card text-ink shadow-sm" : "bg-transparent text-muted hover:text-ink"}`} onClick={() => setParams({ scope: key })}>{text}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 md:p-4">
          <div className="relative min-w-[200px] flex-1 basis-60">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"><SearchIcon /></span>
            <input className={`${fieldClass} h-9 pl-9`} type="search" aria-label="Search tickets" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets…" />
          </div>
          <MultiFilter name="Status" allLabel="All statuses" options={STATUSES.map((v) => ({ value: v, label: label(v) }))} values={listParam(status)} negate={statusNot} onChange={(v, n) => setParams({ status: v.join(","), statusNot: n ? "true" : "" })} />
          <MultiFilter name="Priority" allLabel="All priorities" options={PRIORITIES.map((v) => ({ value: v, label: label(v) }))} values={listParam(priority)} negate={priorityNot} onChange={(v, n) => setParams({ priority: v.join(","), priorityNot: n ? "true" : "" })} />
          {milestones.length > 0 && <MultiFilter name="Milestone" allLabel="Any milestone" options={milestones.map((m) => ({ value: m.id, label: m.name }))} values={listParam(milestoneId)} negate={milestoneNot} onChange={(v, n) => setParams({ milestone: v.join(","), milestoneNot: n ? "true" : "" })} />}
          {groupMembers.length > 0 && <MultiFilter name="Assignee" allLabel="Any assignee" options={groupMembers.map((m) => ({ value: m.id, label: m.name }))} values={listParam(assignee)} negate={assigneeNot} onChange={(v, n) => setParams({ assignee: v.join(","), assigneeNot: n ? "true" : "" })} />}
          {saved.length > 0 && <select className={selectCls} aria-label="Saved views" value={activeSaved?.id ?? ""} onChange={(e) => { const f = saved.find((s) => s.id === e.target.value); if (f) { setSearch(f.query.q ?? ""); router.replace(`?${new URLSearchParams(f.query).toString()}`); } }}><option value="">Saved views</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          {hasFilters && !activeSaved && <Button variant="subtle" size="sm" onClick={() => setSaving(true)}>Save view</Button>}
          {activeSaved && <Button variant="ghost" size="sm" className="text-danger" onClick={async () => { await api(`/saved-filters/${activeSaved.id}`, { method: "DELETE" }); setSaved((s) => s.filter((x) => x.id !== activeSaved.id)); toast("View deleted"); }}>Delete view</Button>}
          <div className="ml-auto inline-flex rounded-lg border border-line-strong bg-soft p-0.5" role="group" aria-label="View">
            {([["list", "List", <ListIcon key="l" size={16} />], ["board", "Board", <BoardIcon key="b" />]] as const).map(([key, text, icon]) => (
              <button key={key} type="button" className={`inline-flex h-8 items-center gap-1.5 rounded-md border-0 px-3 text-[13px] font-semibold transition ${view === key ? "bg-card text-ink shadow-sm" : "bg-transparent text-muted hover:text-ink"}`} aria-pressed={view === key} onClick={() => setParams({ view: key === "board" ? "board" : "" })}>{icon}{text}</button>
            ))}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5" role="toolbar" aria-label="Bulk actions">
            <strong className="mr-1 text-sm">{selected.length} selected</strong>
            {can("tickets.change_status") && <select className={`${selectCls} h-8 text-[13px]`} aria-label="Set status" value="" onChange={(e) => e.target.value && void bulk("status", e.target.value, "Status updated")}><option value="">Set status…</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>}
            {can("tickets.change_priority") && <select className={`${selectCls} h-8 text-[13px]`} aria-label="Set priority" value="" onChange={(e) => e.target.value && void bulk("priority", e.target.value, "Priority updated")}><option value="">Set priority…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>}
            {bulkPeople.length > 0 && <select className={`${selectCls} h-8 text-[13px]`} aria-label="Assign to" value="" onChange={(e) => e.target.value && void bulk("assign", e.target.value, "Assigned")}><option value="">Assign to…</option>{bulkPeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
            {can("tickets.edit") && <select className={`${selectCls} h-8 text-[13px]`} aria-label="Move to group" value="" onChange={(e) => e.target.value && void bulk("move", e.target.value === "none" ? null : e.target.value, "Moved")}><option value="">Move to group…</option><option value="none">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>}
            {bulkMilestones.length > 0 && <select className={`${selectCls} h-8 text-[13px]`} aria-label="Add to milestone" value="" onChange={(e) => e.target.value && void bulk("milestone", e.target.value === "none" ? null : e.target.value, "Milestone updated")}><option value="">Add to milestone…</option>{bulkMilestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}<option value="none">Remove from milestone</option></select>}
            {can("tickets.delete") && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}

        <div className="px-4"><ErrorNote message={error} /></div>
        {loading && !data ? <Skeleton rows={8} className="rounded-none border-0" /> : !data?.tickets.length ? (
          <Empty title={hasFilters ? "No tickets match these filters" : mine ? "Nothing assigned to you" : onlyMine ? "Nothing assigned to you in this group" : "No tickets yet"} hint={hasFilters ? "Clear a filter or try different words." : onlyMine && !mine ? "Switch to “Everything in group” to see the other tickets." : "New tickets show up here as soon as they are created."} action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(""); router.replace("?"); }}>Clear filters</Button> : can("tickets.create") ? <Button onClick={() => setShowCreate(true)}>New ticket</Button> : undefined} />
        ) : view === "board" ? (
          <>
            <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto bg-soft/50 p-4">
              {STATUSES.map((s) => {
                const items = data.tickets.filter((t) => t.status === s);
                return (
                  <div className={`grid min-h-32 content-start gap-2.5 rounded-xl border p-2.5 transition-colors ${dropTarget === s ? "border-accent bg-accent-soft" : "border-line bg-soft"}`} key={s} data-testid="board-column"
                    onDragOver={(e) => { if (can("tickets.change_status")) { e.preventDefault(); setDropTarget(s); } }}
                    onDragLeave={() => setDropTarget("")}
                    onDrop={(e) => { setDropTarget(""); const id = e.dataTransfer.getData("text/plain"); const t = data.tickets.find((x) => x.id === id); if (t) void moveCard(t, s); }}>
                    <h3 className="flex items-center gap-2 px-1 text-[13px] font-semibold"><i className="size-2.5 rounded-full" style={{ background: statusColor(s) }} aria-hidden="true" />{label(s)}<span className="ml-auto rounded-full bg-card px-2 text-xs font-semibold tabular-nums text-muted">{items.length}</span></h3>
                    {items.map((t) => (
                      <Link className={`grid gap-2 rounded-lg border border-line bg-card p-3 shadow-sm transition hover:-translate-y-px hover:border-line-strong hover:shadow-md ${t.priority === "URGENT" ? "shadow-[inset_3px_0_0_var(--p-urgent)]" : t.priority === "HIGH" ? "shadow-[inset_3px_0_0_var(--p-high)]" : ""} ${can("tickets.change_status") ? "cursor-grab active:cursor-grabbing" : ""}`} key={t.id} data-testid="board-card" href={`/tickets/${t.id}`} draggable={can("tickets.change_status")} onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}>
                        <span className="font-mono text-xs text-muted">{t.ticketNumber}</span>
                        <strong className="text-sm font-semibold leading-snug">{t.title}</strong>
                        <span className="flex items-center justify-between gap-2"><PriorityPill priority={t.priority} /><AvatarStack people={assigneesOf(t)} /></span>
                      </Link>
                    ))}
                    {can("tickets.create") && <QuickAdd onAdd={(title) => quickAdd(s, title)} />}
                  </div>
                );
              })}
            </div>
            <p className="border-t border-line px-5 py-3 text-[13px] text-muted">{can("tickets.change_status") ? "Drag cards between columns to change status. " : ""}{data.total > data.tickets.length ? `Showing the ${data.tickets.length} lowest-numbered of ${data.total} tickets.` : ""}</p>
          </>
        ) : (
          <>
            <div className="sticky top-14 z-[5] hidden items-center gap-3 border-b border-line bg-soft pl-4 md:flex">
              <input className={checkCls} type="checkbox" aria-label="Select all on this page" checked={allSelected} onChange={() => setSelected(allSelected ? [] : data.tickets.map((t) => t.id))} />
              <div className="grid flex-1 grid-cols-[64px_minmax(0,1fr)_24px_128px_64px_48px_150px] items-center gap-3 py-2 pr-5 text-[11px] font-semibold uppercase tracking-widest text-muted" aria-hidden="true"><span>ID</span><span>Title</span><span /><span>Status</span><span className="text-right">Due</span><span /><span>Assigned to</span></div>
            </div>
            <div aria-busy={loading}>
              {data.tickets.map((t) => (
                <div className={`flex items-center border-b border-line pl-4 last:border-0 ${selected.includes(t.id) ? "bg-accent-soft/60" : ""}`} key={t.id}>
                  <input className={`${checkCls} mr-1`} type="checkbox" aria-label={`Select ${t.ticketNumber}`} checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                  <div className="min-w-0 flex-1"><TicketRow ticket={t} /></div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) }, true)}>← Previous</Button>
              <span className="text-[13px] text-muted">Page {data.page} of {Math.max(data.pages, 1)} · {data.total} tickets</span>
              <Button variant="ghost" size="sm" disabled={page >= data.pages} onClick={() => setParams({ page: String(page + 1) }, true)}>Next →</Button>
            </div>
          </>
        )}
      </section>
      {showCreate && <TicketForm defaultGroupId={inGroup ? groupId : ""} onClose={() => { setShowCreate(false); reload(); }} />}
      {showImport && <ImportModal groups={groups} defaultGroupId={groupId} onClose={() => setShowImport(false)} onDone={reload} />}
      {confirmDelete && <ConfirmDialog title="Delete tickets" message={`Delete ${selected.length} selected tickets? You can undo right after, and a SuperAdmin can restore them later.`} confirmLabel="Delete" onClose={() => setConfirmDelete(false)} onConfirm={() => bulk("delete", null, "Deleted")} />}
      {saving && (
        <Modal title="Save this view" onClose={() => setSaving(false)}>
          <form className="grid gap-5" onSubmit={async (e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("name")).trim(); if (!name) return; try { const f = await api<SavedFilter>("/saved-filters", { method: "POST", body: json({ name, query: currentQuery }) }); setSaved((s) => [...s, f]); setSaving(false); toast("View saved"); } catch (err) { toast((err as Error).message, "error"); } }}>
            <label className="grid gap-1.5 text-sm font-semibold">Name<input className={fieldClass} name="name" required maxLength={60} placeholder="Urgent in Ops" autoFocus /></label>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setSaving(false)}>Cancel</Button><Button type="submit">Save view</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [title, setTitle] = useState("");
  return (
    <form onSubmit={async (e) => { e.preventDefault(); if (!title.trim()) return; const t = title; setTitle(""); await onAdd(t.trim()); }}>
      <input className={`${fieldClass} border-dashed bg-transparent py-1.5 text-[13px]`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="+ Add a ticket…" aria-label="Quick add ticket" maxLength={200} />
    </form>
  );
}
