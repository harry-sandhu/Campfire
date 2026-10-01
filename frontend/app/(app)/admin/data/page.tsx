"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { Badge, Button, Field, fieldClass, rowClass, tdClass, thClass } from "../../../../components/controls";
import { Modal } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Empty, ErrorNote, Panel, Skeleton, Stat } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { formatDate, label } from "../../../../lib/format";
import { useDebounce } from "../../../../lib/use-debounce";
import { useLoad } from "../../../../lib/use-load";
import { STATUSES, type Group } from "../../../../lib/types";

type Summary = { counts: Record<string, number>; storage: { dataSize: number; storageSize: number } | null };
type Row = { id: string; ticketNumber: string; title: string; status: string; updatedAt: string; deletedAt?: string | null; groupId?: { name: string } | null };
type Found = { tickets: Row[]; total: number; page: number; pages: number };
type DeletedGroup = { id: string; name: string; deletedAt: string; members: number };

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

export default function DataPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [filters, setFilters] = useState({ state: "any", olderThanDays: "365", groupId: "", status: "", search: "" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [purge, setPurge] = useState<null | { mode: "selected" | "all" }>(null);
  const [typed, setTyped] = useState("");
  const [cleanup, setCleanup] = useState({ target: "activity", olderThanDays: "365" });
  const search = useDebounce(filters.search);
  const admin = user?.role === "SUPERADMIN";

  const summary = useLoad(() => (admin ? api<Summary>("/admin/data/summary") : Promise.resolve(null)), [admin]);
  const deletedGroups = useLoad(() => (admin ? api<{ groups: DeletedGroup[] }>("/admin/data/groups") : Promise.resolve(null)), [admin]);
  const queryString = () => {
    const q = new URLSearchParams({ state: filters.state });
    if (filters.olderThanDays) q.set("olderThanDays", filters.olderThanDays);
    if (filters.groupId === "none") q.set("ungrouped", "true"); else if (filters.groupId) q.set("groupId", filters.groupId);
    if (filters.status) q.set("status", filters.status);
    if (search) q.set("search", search);
    return q;
  };
  const found = useLoad(() => (admin ? api<Found>(`/admin/data/tickets?${queryString()}&page=${page}`) : Promise.resolve(null)), [admin, filters.state, filters.olderThanDays, filters.groupId, filters.status, search, page]);

  useEffect(() => { api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined); }, []);
  useEffect(() => { setSelected([]); setPage(1); }, [filters.state, filters.olderThanDays, filters.groupId, filters.status, search]);

  if (!admin) return <><PageHeader eyebrow="Admin" title="Data management" /><Empty title="SuperAdmin only" /></>;

  const filterBody = () => ({
    state: filters.state, ...(filters.olderThanDays ? { olderThanDays: Number(filters.olderThanDays) } : {}),
    ...(filters.groupId === "none" ? { ungrouped: "true" } : filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.status ? { status: filters.status } : {}), ...(search ? { search } : {}),
  });
  const reloadAll = () => { summary.reload(); deletedGroups.reload(); found.reload(); setSelected([]); };

  async function restore() {
    try { const r = await api<{ restored: number }>("/admin/data/tickets/restore", { method: "POST", body: json({ ids: selected }) }); toast(`Restored ${r.restored} tickets`); reloadAll(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function doPurge() {
    if (!purge) return;
    try {
      const body = purge.mode === "selected" ? { ids: selected, confirm: "DELETE" } : { filter: filterBody(), confirm: "DELETE" };
      const r = await api<{ deleted: number }>("/admin/data/tickets/purge", { method: "POST", body: json(body) });
      toast(`Permanently deleted ${r.deleted} tickets`);
      setPurge(null); setTyped(""); reloadAll();
    } catch (e) { toast((e as Error).message, "error"); }
  }

  async function doCleanup() {
    if (!window.confirm(`Delete all ${cleanup.target} records older than ${cleanup.olderThanDays} days? This cannot be undone.`)) return;
    try { const r = await api<{ deleted: number }>("/admin/data/cleanup", { method: "POST", body: json({ target: cleanup.target, olderThanDays: Number(cleanup.olderThanDays), confirm: "DELETE" }) }); toast(`Deleted ${r.deleted} records`); reloadAll(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  const rows = found.data?.tickets ?? [];
  const count = purge?.mode === "all" ? found.data?.total ?? 0 : selected.length;
  const counts = summary.data?.counts;

  const select = `${fieldClass.replace("w-full", "")} h-9 w-auto py-0`;
  const checkCls = "size-4 cursor-pointer accent-[var(--accent)]";

  return (
    <>
      <PageHeader eyebrow="Admin" title="Data management" />
      {summary.loading && !summary.data ? <Skeleton rows={3} /> : counts && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Active tickets" value={counts.tickets} />
          <Stat label="In trash" value={counts.deletedTickets} tone="blocked" />
          <Stat label="Comments" value={counts.comments} tone="review" />
          <Stat label="Activity records" value={counts.activity} tone="progress" />
          {summary.data?.storage && <Stat label="Database size" value={mb(summary.data.storage.dataSize)} tone="done" />}
        </div>
      )}

      <Panel title="Find old tickets" description="Oldest first. Restore items from trash, or permanently delete tickets together with their comments, links and activity.">
        <div className="flex flex-wrap gap-2 border-b border-line p-4">
          <select className={select} aria-label="State" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}><option value="any">Active and trash</option><option value="active">Active only</option><option value="deleted">Trash only</option></select>
          <select className={select} aria-label="Age" value={filters.olderThanDays} onChange={(e) => setFilters({ ...filters, olderThanDays: e.target.value })}><option value="">Any age</option>{[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>Not updated in {d} days</option>)}</select>
          <select className={select} aria-label="Group" value={filters.groupId} onChange={(e) => setFilters({ ...filters, groupId: e.target.value })}><option value="">All groups</option><option value="none">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select className={select} aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <input className={`${fieldClass} h-9 min-w-48 flex-1`} type="search" aria-label="Search" placeholder="Number or title…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <ErrorNote message={found.error} />
        {found.loading && !found.data ? <Skeleton rows={5} className="rounded-none border-0" /> : !rows.length ? <Empty title="No tickets match" /> : <>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2.5">
            <strong className="mr-2 text-sm">{selected.length} selected · {found.data!.total} match</strong>
            <Button variant="secondary" size="sm" disabled={!selected.length} onClick={() => void restore()}>Restore selected</Button>
            <Button variant="ghost" size="sm" className="text-danger" disabled={!selected.length} onClick={() => { setTyped(""); setPurge({ mode: "selected" }); }}>Delete selected…</Button>
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => { setTyped(""); setPurge({ mode: "all" }); }}>Delete all {found.data!.total} matching…</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr><th className={thClass}><input className={checkCls} type="checkbox" aria-label="Select all on page" checked={selected.length === rows.length} onChange={() => setSelected(selected.length === rows.length ? [] : rows.map((r) => r.id))} /></th><th className={thClass}>Ticket</th><th className={thClass}>Group</th><th className={thClass}>Status</th><th className={thClass}>Last updated</th><th className={thClass}>State</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-hover">
                  <td className={tdClass}><input className={checkCls} type="checkbox" aria-label={`Select ${r.ticketNumber}`} checked={selected.includes(r.id)} onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} /></td>
                  <td className={tdClass}><span className="mr-2 font-mono text-xs text-muted">{r.ticketNumber}</span>{r.title}</td><td className={tdClass}>{r.groupId?.name ?? "—"}</td><td className={tdClass}>{label(r.status)}</td><td className={`${tdClass} whitespace-nowrap`}>{formatDate(r.updatedAt)}</td><td className={tdClass}>{r.deletedAt ? <Badge tone="danger">In trash</Badge> : <Badge tone="success">Active</Badge>}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-3"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</Button><span className="text-[13px] text-muted">Page {found.data!.page} of {Math.max(found.data!.pages, 1)}</span><Button variant="ghost" size="sm" disabled={page >= found.data!.pages} onClick={() => setPage(page + 1)}>Next →</Button></div>
        </>}
      </Panel>

      <Panel className="mt-6" title="Deleted groups" description="Groups removed by their creators. Restoring brings back membership and visibility.">
        {deletedGroups.data?.groups.map((g) => (
          <div className={rowClass} key={g.id}><div className="min-w-48 flex-1"><strong className="block">{g.name}</strong><small className="text-muted">Deleted {formatDate(g.deletedAt)} · {g.members} members</small></div><Button variant="secondary" size="sm" onClick={() => void api(`/admin/data/groups/${g.id}/restore`, { method: "POST" }).then(() => { toast("Group restored"); reloadAll(); }).catch((e) => toast(e.message, "error"))}>Restore</Button></div>
        ))}
        {!deletedGroups.data?.groups.length && <p className="p-5 text-muted">No deleted groups.</p>}
      </Panel>

      <Panel className="mt-6 border-danger/40" title="Clean up old records" description="Frees database space. Ticket history is kept unless you delete the tickets themselves.">
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Records"><select className={fieldClass} value={cleanup.target} onChange={(e) => setCleanup({ ...cleanup, target: e.target.value })}><option value="activity">Ticket activity</option><option value="notifications">Notifications</option><option value="audit">Audit log</option></select></Field>
          <Field label="Older than"><select className={fieldClass} value={cleanup.olderThanDays} onChange={(e) => setCleanup({ ...cleanup, olderThanDays: e.target.value })}>{[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>{d} days</option>)}</select></Field>
          <Button variant="danger" onClick={() => void doCleanup()}>Delete old records</Button>
        </div>
      </Panel>

      {purge && (
        <Modal title="Permanently delete tickets" eyebrow="Cannot be undone" onClose={() => setPurge(null)}>
          <div className="grid gap-5">
            <p>This permanently deletes <strong>{count}</strong> tickets together with their comments, links, activity and notifications.{purge.mode === "all" && " Everything matching the current filters is included, not just this page."}</p>
            <Field label="Type DELETE to confirm"><input className={fieldClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPurge(null)}>Cancel</Button><Button variant="danger" disabled={typed !== "DELETE" || !count} onClick={() => void doPurge()}>Delete permanently</Button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
