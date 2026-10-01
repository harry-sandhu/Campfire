"use client";
import { useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { PageHeader } from "../../../components/shell";
import { Badge, Button, fieldClass, tdClass, thClass } from "../../../components/controls";
import { Empty, ErrorNote, Panel, Skeleton } from "../../../components/ui";
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

  const select = `${fieldClass.replace("w-full", "")} h-9 w-auto py-0`;
  return (
    <>
      <PageHeader eyebrow="Security" title="Audit log" />
      <Panel>
        {!allowed ? <Empty title="No access" hint="You need the audit.view permission." /> : <>
          <div className="flex flex-wrap gap-2 border-b border-line p-4">
            <input className={`${fieldClass} h-9 min-w-52 flex-1`} type="search" aria-label="Search audit log" placeholder="Search summaries…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <select className={select} aria-label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{data?.actions.map((a) => <option key={a} value={a}>{label(a)}</option>)}</select>
          </div>
          <ErrorNote message={error} />
          {loading && !data ? <Skeleton rows={5} className="rounded-none border-0" /> : !data?.entries.length ? <Empty title="No entries" /> : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead><tr><th className={thClass}>When</th><th className={thClass}>Who</th><th className={thClass}>Action</th><th className={thClass}>Details</th></tr></thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e._id} className="transition-colors hover:bg-hover">
                      <td className={`${tdClass} whitespace-nowrap text-muted`} title={new Date(e.createdAt).toLocaleString()}>{timeAgo(e.createdAt)}</td>
                      <td className={`${tdClass} whitespace-nowrap font-medium`}>{e.actorId?.name ?? "System"}</td>
                      <td className={tdClass}><Badge>{label(e.action)}</Badge></td>
                      <td className={tdClass}>{e.summary}{e.metadata && Object.keys(e.metadata).length > 0 && <small className="break-all text-muted"> {JSON.stringify(e.metadata)}</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && <div className="flex items-center justify-between px-4 py-3"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Newer</Button><span className="text-[13px] text-muted">Page {data.page} of {Math.max(data.pages, 1)} · {data.total} entries</span><Button variant="ghost" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Older →</Button></div>}
        </>}
      </Panel>
    </>
  );
}
