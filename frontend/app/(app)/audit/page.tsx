"use client";
import { useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { PageHeader } from "../../../components/shell";
import { Empty, ErrorNote, Skeleton } from "../../../components/ui";
import { api } from "../../../lib/api";
import { label, timeAgo } from "../../../lib/format";
import { useDebounce } from "../../../lib/use-debounce";
import { useLoad } from "../../../lib/use-load";

type Entry = { _id: string; action: string; summary: string; createdAt: string; ip?: string; actorId?: { name: string; email: string } | null; metadata?: Record<string, unknown> };
type AuditData = { entries: Entry[]; total: number; page: number; pages: number; actions: string[] };

export default function AuditPage() {
  const { can } = useAuth();
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const allowed = can("audit.view");
  const { data, error, loading } = useLoad(() => (allowed ? api<AuditData>(`/audit?page=${page}${action ? `&action=${action}` : ""}${q ? `&search=${encodeURIComponent(q)}` : ""}`) : Promise.resolve(null)), [allowed, action, q, page]);

  return (
    <>
      <PageHeader eyebrow="SECURITY" title="Audit log" />
      <section className="panel">
        {!allowed ? <Empty title="No access" hint="You need the audit.view permission." /> : <>
          <div className="filters">
            <input className="search" type="search" aria-label="Search audit log" placeholder="Search summaries…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <select aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{data?.actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}</select>
          </div>
          <ErrorNote message={error} />
          {loading && !data ? <Skeleton rows={5} /> : !data?.entries.length ? <Empty title="No entries" /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e._id}>
                      <td title={new Date(e.createdAt).toLocaleString()}>{timeAgo(e.createdAt)}</td>
                      <td>{e.actorId?.name ?? "System"}</td>
                      <td><span className="chip">{label(e.action)}</span></td>
                      <td>{e.summary}{e.metadata && Object.keys(e.metadata).length > 0 && <small className="muted meta"> {JSON.stringify(e.metadata)}</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && <div className="pager"><button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</button><span className="muted">Page {data.page} of {Math.max(data.pages, 1)} · {data.total} entries</span><button type="button" className="ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older →</button></div>}
        </>}
      </section>
    </>
  );
}
