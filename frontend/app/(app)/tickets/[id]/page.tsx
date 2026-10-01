"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { CommentComposer } from "../../../../components/comment-composer";
import { Markdown } from "../../../../components/markdown";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import { ConfirmDialog, Modal } from "../../../../components/modal";
import { useLiveEvents } from "../../../../components/realtime";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Avatar, ErrorNote, PriorityPill, Spinner, StatusPill } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { assigneesOf, formatDate, label, timeAgo } from "../../../../lib/format";
import { useLoad } from "../../../../lib/use-load";
import { PRIORITIES, STATUSES, type Activity, type Comment, type Group, type Member, type Milestone, type Person, type Topic, type TicketDetailData } from "../../../../lib/types";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, refresh } = useLoad(() => api<TicketDetailData>(`/tickets/${id}`), [id]);
  const [people, setPeople] = useState<Person[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [formError, setFormError] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [relating, setRelating] = useState(false);
  const [olderComments, setOlderComments] = useState<Comment[]>([]);
  const [olderActivity, setOlderActivity] = useState<Activity[]>([]);
  const [moreComments, setMoreComments] = useState<boolean | null>(null);
  const [moreActivity, setMoreActivity] = useState<boolean | null>(null);

  const ticket = data?.ticket;
  const groupId = ticket?.groupId?._id ?? "";

  useLiveEvents((event) => { if (event.ticketId === id) refresh(); });

  useEffect(() => {
    if (!ticket) return;
    setMilestones([]);
    if (groupId) {
      api<{ members: Member[]; topics: Topic[] }>(`/groups/${groupId}`).then((d) => { setPeople(d.members); setTopics(d.topics.filter((t) => !t.archivedAt)); }).catch(() => undefined);
      api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`).then((d) => setMilestones(d.milestones)).catch(() => undefined);
    } else {
      setTopics([]);
      if (can("tickets.assign")) api<{ users: Person[] }>("/users/assignees").then((d) => setPeople(d.users)).catch(() => undefined);
    }
    if (can("tickets.edit")) api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined);
    // eslint-disable-next-line
  }, [ticket?.id, groupId]);

  useEffect(() => { if (ticket && !editing) setDescription(ticket.description); }, [ticket, editing]);

  async function patch(changes: Record<string, unknown>, message = "Saved") {
    setFormError("");
    try { await api(`/tickets/${id}`, { method: "PATCH", body: json(changes) }); toast(message); refresh(); }
    catch (e) { setFormError((e as Error).message); }
  }

  async function run(action: () => Promise<unknown>, message?: string) {
    try { await action(); if (message) toast(message); refresh(); } catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data || !ticket) return <><PageHeader title="Ticket" /><ErrorNote message={error || "Ticket not found"} /><Link href="/tickets" className="link-button">← Back to tickets</Link></>;

  const assigned = assigneesOf(ticket).map((p) => p._id);
  const canEdit = can("tickets.edit");
  const comments = [...olderComments, ...data.comments];
  const activities = [...data.activities, ...olderActivity];
  const hasMoreComments = moreComments ?? data.hasMoreComments;
  const hasMoreActivity = moreActivity ?? data.hasMoreActivity;
  const done = data.subtasks.filter((s) => s.status === "COMPLETED" || s.status === "CLOSED").length;
  const mentionable: Person[] = people.length ? people : assigneesOf(ticket).map((p) => ({ id: p._id, name: p.name, email: p.email ?? "" }));

  async function loadOlder<T>(path: string, key: "comments" | "activities", ids: { _id: string }[], apply: (items: T[], more: boolean) => void) {
    try {
      const res = await api<Record<string, unknown>>(`${path}?before=${ids[0]?._id ?? ""}`);
      apply(res[key] as T[], !!(res.hasMore));
    } catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <>
      <PageHeader eyebrow={ticket.ticketNumber} title={ticket.title}>
        <Link href="/tickets" className="ghost link-button">← Tickets</Link>
        <button type="button" className="ghost" aria-pressed={data.watching} onClick={() => void run(() => api(`/tickets/${id}/watch`, { method: data.watching ? "DELETE" : "POST" }), data.watching ? "Stopped watching" : "Watching this ticket")}>{data.watching ? "★ Watching" : "☆ Watch"}</button>
        {canEdit && <button type="button" className="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel edit" : "Edit"}</button>}
        {can("tickets.delete") && <button type="button" className="ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete</button>}
      </PageHeader>
      {data.parent && <p className="muted lead">Subtask of <Link className="ticket-id" href={`/tickets/${data.parent.id}`}>{data.parent.ticketNumber}</Link> {data.parent.title}</p>}
      <ErrorNote message={formError} />
      <div className="detail-layout">
        <div>
          <section className="panel pad">
            {editing ? (
              <form className="stack" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); await patch({ title: f.get("title"), description, dueDate: f.get("dueDate") || null }); setEditing(false); }}>
                <label>Title<input name="title" defaultValue={ticket.title} required maxLength={200} /></label>
                <div className="field"><span className="label-text">Description</span><MarkdownEditor value={description} onChange={setDescription} rows={8} /></div>
                <label>Due date<input name="dueDate" type="date" defaultValue={ticket.dueDate?.slice(0, 10) ?? ""} /></label>
                <div className="modal-actions"><button>Save changes</button></div>
              </form>
            ) : ticket.description ? <Markdown>{ticket.description}</Markdown> : <p className="muted">No description provided.</p>}
          </section>

          <section className="panel pad spaced">
            <div className="section-title"><h2>Subtasks{data.subtasks.length > 0 && <span className="muted"> · {done}/{data.subtasks.length} done</span>}</h2></div>
            {data.subtasks.length > 0 && <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={data.subtasks.length}><span style={{ width: `${(done / data.subtasks.length) * 100}%` }} /></div>}
            {data.subtasks.map((s) => <Link key={s.id} href={`/tickets/${s.id}`} className="link-row"><span><span className="ticket-id">{s.ticketNumber}</span> {s.title}</span><StatusPill status={s.status} /></Link>)}
            {!data.subtasks.length && <p className="muted">No subtasks.</p>}
            {can("tickets.create") && !data.parent && (
              <form className="comment-form" onSubmit={async (e) => { e.preventDefault(); if (!subtaskTitle.trim()) return; await run(() => api("/tickets", { method: "POST", body: json({ title: subtaskTitle, parentId: id, groupId: groupId || null, topicIds: [] }) }), "Subtask added"); setSubtaskTitle(""); }}>
                <input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Add a subtask…" aria-label="New subtask title" maxLength={200} />
                <button>Add</button>
              </form>
            )}
          </section>

          <section className="panel pad spaced">
            <div className="section-title"><h2>Related tickets</h2>{canEdit && <button type="button" className="link-button" onClick={() => setRelating(true)}>+ Relate</button>}</div>
            {data.relations.map((r) => (
              <div className="link-row" key={`${r.type}${r.id}`}>
                <Link href={`/tickets/${r.id}`}><span className="chip">{{ blocks: "Blocks", blockedBy: "Blocked by", relates: "Related" }[r.type]}</span> <span className="ticket-id">{r.ticketNumber}</span> {r.title}</Link>
                {canEdit && <button type="button" className="link-button" onClick={() => void run(() => api(`/tickets/${id}/relations/${r.id}`, { method: "DELETE" }), "Relation removed")}>Remove</button>}
              </div>
            ))}
            {!data.relations.length && <p className="muted">No related tickets.</p>}
          </section>

          <section className="panel pad spaced">
            <h2>Comments</h2>
            {hasMoreComments && <button type="button" className="link-button" onClick={() => void loadOlder<Comment>(`/tickets/${id}/comments`, "comments", comments, (items, more) => { setOlderComments((c) => [...items, ...c]); setMoreComments(more); })}>Load earlier comments</button>}
            {can("comments.view") ? comments.map((c) => (
              <div className="comment" key={c._id}>
                <div className="comment-head"><Avatar name={c.authorId?.name ?? "?"} /><strong>{c.authorId?.name ?? "User"}</strong> <small className="muted">{timeAgo(c.createdAt)}</small></div>
                <Markdown>{c.body}</Markdown>
                {(c.authorId?._id === user!.id || user!.role === "SUPERADMIN") && can("comments.delete") && <button type="button" className="link-button" onClick={() => void run(async () => { await api(`/tickets/${id}/comments/${c._id}`, { method: "DELETE" }); setOlderComments((o) => o.filter((x) => x._id !== c._id)); }, "Comment deleted")}>Delete</button>}
              </div>
            )) : <p className="muted">You do not have permission to view comments.</p>}
            {!comments.length && can("comments.view") && <p className="muted">No comments yet.</p>}
            {can("comments.create") && <CommentComposer people={mentionable} onSubmit={(body, mentionIds) => api(`/tickets/${id}/comments`, { method: "POST", body: json({ body, mentionIds }) }).then(() => { setMoreComments(null); refresh(); })} />}
          </section>

          <section className="panel pad spaced">
            <h2>Links</h2>
            {can("ticket_links.view") && data.links.map((l) => (
              <div className="link-row" key={l._id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>
                {can("ticket_links.delete") && <button type="button" className="link-button" onClick={() => void run(() => api(`/tickets/${id}/links/${l._id}`, { method: "DELETE" }), "Link removed")}>Remove</button>}
              </div>
            ))}
            {can("ticket_links.view") && !data.links.length && <p className="muted">No links yet.</p>}
            {can("ticket_links.create") && (
              <form className="form-row" onSubmit={async (e) => { e.preventDefault(); await run(() => api(`/tickets/${id}/links`, { method: "POST", body: json(linkDraft) }), "Link added"); setLinkDraft({ label: "", url: "" }); }}>
                <input placeholder="Label" aria-label="Link label" value={linkDraft.label} onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })} required maxLength={120} />
                <input placeholder="https://…" aria-label="Link URL" type="url" value={linkDraft.url} onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })} required />
                <button>Add link</button>
              </form>
            )}
          </section>
        </div>

        <aside className="side-panel panel pad">
          <dl className="props">
            <dt>Status</dt>
            <dd>{can("tickets.change_status") ? <select aria-label="Status" value={ticket.status} onChange={(e) => void patch({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select> : <StatusPill status={ticket.status} />}</dd>
            <dt>Priority</dt>
            <dd>{can("tickets.change_priority") ? <select aria-label="Priority" value={ticket.priority} onChange={(e) => void patch({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select> : <PriorityPill priority={ticket.priority} />}</dd>
            <dt>Group</dt>
            <dd>{canEdit && groups.length && !data.parent && !data.subtasks.length ? (
              <select aria-label="Group" value={groupId} onChange={(e) => void patch({ groupId: e.target.value || null }, "Ticket moved")}>
                <option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>) : ticket.groupId?.name ?? "No group"}</dd>
            <dt>Milestone</dt>
            <dd>{canEdit && milestones.length ? (
              <select aria-label="Milestone" value={ticket.milestoneId?._id ?? ""} onChange={(e) => void patch({ milestoneId: e.target.value || null })}>
                <option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>) : ticket.milestoneId?.name ?? "—"}</dd>
            <dt>Topics</dt>
            <dd>{canEdit && topics.length ? (
              <div className="check-grid">{topics.map((t) => {
                const on = ticket.topicIds?.some((x) => x._id === t.id);
                return <label key={t.id} className="check"><input type="checkbox" checked={!!on} onChange={() => void patch({ topicIds: (ticket.topicIds ?? []).map((x) => x._id).filter((x) => x !== t.id).concat(on ? [] : [t.id]) })} />{t.name}</label>;
              })}</div>) : ticket.topicIds?.length ? ticket.topicIds.map((t) => <span className="chip" key={t._id}>{t.name}</span>) : "—"}</dd>
            <dt>Assignees</dt>
            <dd>{can("tickets.assign") && people.length ? (
              <div className="check-grid">{people.map((p) => (
                <label key={p.id} className="check"><input type="checkbox" checked={assigned.includes(p.id)} onChange={() => void patch({ assigneeIds: assigned.includes(p.id) ? assigned.filter((x) => x !== p.id) : [...assigned, p.id] }, "Assignees updated")} />{p.name}</label>
              ))}</div>) : assigneesOf(ticket).map((p) => p.name).join(", ") || "Unassigned"}</dd>
            <dt>Due</dt><dd>{formatDate(ticket.dueDate)}</dd>
            <dt>Created</dt><dd>{formatDate(ticket.createdAt)} by {ticket.createdById?.name ?? "—"}</dd>
          </dl>
          <h3>Activity</h3>
          <div className="activity-list">
            {activities.map((a) => <p key={a._id}><span>{a.actorId?.name ?? "User"}</span> {label(a.type).toLowerCase()} <small className="muted">{timeAgo(a.createdAt)}</small></p>)}
            {hasMoreActivity && <button type="button" className="link-button" onClick={() => void loadOlder<Activity>(`/tickets/${id}/activity`, "activities", activities.slice(-1), (items, more) => { setOlderActivity((o) => [...o, ...items]); setMoreActivity(more); })}>Show older activity</button>}
          </div>
        </aside>
      </div>
      {relating && <RelateDialog ticketId={id} onClose={() => setRelating(false)} onDone={() => { setRelating(false); refresh(); }} />}
      {confirmDelete && <ConfirmDialog title="Delete ticket" message="This removes the ticket for everyone. A SuperAdmin can restore it from Data management." confirmLabel="Delete ticket" onClose={() => setConfirmDelete(false)} onConfirm={async () => { try { await api(`/tickets/${id}`, { method: "DELETE" }); toast("Ticket deleted"); router.replace("/tickets"); } catch (e) { toast((e as Error).message, "error"); } }} />}
    </>
  );
}

function RelateDialog({ ticketId, onClose, onDone }: { ticketId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("BLOCKS");
  const [results, setResults] = useState<{ id: string; ticketNumber: string; title: string }[]>([]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => api<{ tickets: typeof results }>(`/search?q=${encodeURIComponent(query)}`).then((d) => setResults(d.tickets.filter((t) => t.id !== ticketId))).catch(() => undefined), 250);
    return () => clearTimeout(timer);
  }, [query, ticketId]);

  return (
    <Modal title="Relate to another ticket" onClose={onClose}>
      <div className="stack">
        <label>Relationship<select value={type} onChange={(e) => setType(e.target.value)}><option value="BLOCKS">This ticket blocks…</option><option value="RELATES">Is related to…</option></select></label>
        <label>Find a ticket<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Number or title" autoFocus /></label>
        <ul className="palette-list">
          {results.map((t) => <li key={t.id}><button type="button" className="ghost" onClick={async () => { try { await api(`/tickets/${ticketId}/relations`, { method: "POST", body: json({ type, ticketId: t.id }) }); toast("Tickets related"); onDone(); } catch (e) { toast((e as Error).message, "error"); } }}><span className="ticket-id">{t.ticketNumber}</span> {t.title}</button></li>)}
        </ul>
      </div>
    </Modal>
  );
}
