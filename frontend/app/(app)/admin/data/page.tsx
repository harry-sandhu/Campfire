"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { Modal } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Empty, ErrorNote, Spinner, Stat } from "../../../../components/ui";
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

  if (!admin) return <><PageHeader eyebrow="ADMIN" title="Data management" /><Empty title="SuperAdmin only" /></>;

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

  return (
    <>
      <PageHeader eyebrow="ADMIN" title="Data management" />
      {summary.loading && !summary.data ? <Spinner /> : counts && (
        <div className="stats">
          <Stat label="Active tickets" value={counts.tickets} tone="blue" />
          <Stat label="In trash" value={counts.deletedTickets} tone="red" />
          <Stat label="Comments" value={counts.comments} tone="amber" />
          <Stat label="Activity records" value={counts.activity} tone="green" />
          {summary.data?.storage && <Stat label="Database size" value={mb(summary.data.storage.dataSize)} tone="blue" />}
        </div>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>Find old tickets</h2><p className="muted">Oldest first. Restore items from trash, or permanently delete tickets together with their comments, links and activity.</p></div></div>
        <div className="filters">
          <select aria-label="State" value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })}><option value="any">Active and trash</option><option value="active">Active only</option><option value="deleted">Trash only</option></select>
          <select aria-label="Age" value={filters.olderThanDays} onChange={(e) => setFilters({ ...filters, olderThanDays: e.target.value })}><option value="">Any age</option>{[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>Not updated in {d} days</option>)}</select>
          <select aria-label="Group" value={filters.groupId} onChange={(e) => setFilters({ ...filters, groupId: e.target.value })}><option value="">All groups</option><option value="none">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select aria-label="Status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any status</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
          <input className="search" type="search" aria-label="Search" placeholder="Number or title…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <ErrorNote message={found.error} />
        {found.loading && !found.data ? <Spinner /> : !rows.length ? <Empty title="No tickets match" /> : <>
          <div className="bulk-bar">
            <strong>{selected.length} selected · {found.data!.total} match</strong>
            <button type="button" className="ghost" disabled={!selected.length} onClick={() => void restore()}>Restore selected</button>
            <button type="button" className="ghost danger-text" disabled={!selected.length} onClick={() => { setTyped(""); setPurge({ mode: "selected" }); }}>Delete selected…</button>
            <button type="button" className="ghost danger-text" onClick={() => { setTyped(""); setPurge({ mode: "all" }); }}>Delete all {found.data!.total} matching…</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th><input type="checkbox" aria-label="Select all on page" checked={selected.length === rows.length} onChange={() => setSelected(selected.length === rows.length ? [] : rows.map((r) => r.id))} /></th><th>Ticket</th><th>Group</th><th>Status</th><th>Last updated</th><th>State</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" aria-label={`Select ${r.ticketNumber}`} checked={selected.includes(r.id)} onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} /></td>
                  <td><span className="ticket-id">{r.ticketNumber}</span> {r.title}</td><td>{r.groupId?.name ?? "—"}</td><td>{label(r.status)}</td><td>{formatDate(r.updatedAt)}</td><td>{r.deletedAt ? <span className="chip overdue">In trash</span> : "Active"}</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div className="pager"><button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button><span className="muted">Page {found.data!.page} of {Math.max(found.data!.pages, 1)}</span><button type="button" className="ghost" disabled={page >= found.data!.pages} onClick={() => setPage(page + 1)}>Next →</button></div>
        </>}
      </section>

      <section className="panel spaced">
        <div className="panel-head"><div><h2>Deleted groups</h2><p className="muted">Groups removed by their creators. Restoring brings back membership and visibility.</p></div></div>
        <div className="people-list">
          {deletedGroups.data?.groups.map((g) => (
            <div className="person-row" key={g.id}><div><strong>{g.name}</strong><small>Deleted {formatDate(g.deletedAt)} · {g.members} members</small></div><button type="button" className="ghost" onClick={() => void api(`/admin/data/groups/${g.id}/restore`, { method: "POST" }).then(() => { toast("Group restored"); reloadAll(); }).catch((e) => toast(e.message, "error"))}>Restore</button></div>
          ))}
          {!deletedGroups.data?.groups.length && <p className="muted pad">No deleted groups.</p>}
        </div>
      </section>

      <section className="panel spaced pad">
        <h2>Clean up old records</h2>
        <p className="muted">Frees database space. Ticket history is kept unless you delete the tickets themselves.</p>
        <div className="form-row">
          <label>Records<select value={cleanup.target} onChange={(e) => setCleanup({ ...cleanup, target: e.target.value })}><option value="activity">Ticket activity</option><option value="notifications">Notifications</option><option value="audit">Audit log</option></select></label>
          <label>Older than<select value={cleanup.olderThanDays} onChange={(e) => setCleanup({ ...cleanup, olderThanDays: e.target.value })}>{[30, 90, 180, 365, 730].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <button type="button" className="danger" onClick={() => void doCleanup()}>Delete old records</button>
        </div>
      </section>

      {purge && (
        <Modal title="Permanently delete tickets" eyebrow="CANNOT BE UNDONE" onClose={() => setPurge(null)}>
          <div className="stack">
            <p>This permanently deletes <strong>{count}</strong> tickets together with their comments, links, activity and notifications.{purge.mode === "all" && " Everything matching the current filters is included, not just this page."}</p>
            <label>Type DELETE to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setPurge(null)}>Cancel</button><button type="button" className="danger" disabled={typed !== "DELETE" || !count} onClick={() => void doPurge()}>Delete permanently</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
