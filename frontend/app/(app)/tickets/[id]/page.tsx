"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { ConfirmDialog } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { ErrorNote, PriorityPill, Spinner, StatusPill } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { assigneesOf, formatDate, label, timeAgo } from "../../../../lib/format";
import { useLoad } from "../../../../lib/use-load";
import { PRIORITIES, STATUSES, type Group, type Member, type Person, type Topic, type TicketDetailData } from "../../../../lib/types";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user, can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<TicketDetailData>(`/tickets/${id}`), [id]);
  const [people, setPeople] = useState<Person[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comment, setComment] = useState("");
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [formError, setFormError] = useState("");

  const ticket = data?.ticket;
  const groupId = ticket?.groupId?._id ?? "";

  useEffect(() => {
    if (!ticket) return;
    if (groupId) {
      api<{ members: Member[]; topics: Topic[] }>(`/groups/${groupId}`).then((d) => { setPeople(d.members); setTopics(d.topics.filter((t) => !t.archivedAt)); }).catch(() => undefined);
    } else {
      setTopics([]);
      if (can("tickets.assign")) api<{ users: Person[] }>("/users/assignees").then((d) => setPeople(d.users)).catch(() => undefined);
    }
    if (can("tickets.edit")) api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined);
    // eslint-disable-next-line
  }, [ticket?.id, groupId]);

  async function patch(changes: Record<string, unknown>, message = "Saved") {
    setFormError("");
    try {
      await api(`/tickets/${id}`, { method: "PATCH", body: json(changes) });
      toast(message);
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function run(action: () => Promise<unknown>, message?: string) {
    try { await action(); if (message) toast(message); reload(); } catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading && !data) return <Spinner />;
  if (error || !data || !ticket) return <><PageHeader title="Ticket" /><ErrorNote message={error || "Ticket not found"} /><Link href="/tickets" className="link-button">← Back to tickets</Link></>;

  const assigned = assigneesOf(ticket).map((p) => p._id);
  const canEdit = can("tickets.edit");

  return (
    <>
      <PageHeader eyebrow={ticket.ticketNumber} title={ticket.title}>
        <Link href="/tickets" className="ghost link-button">← Tickets</Link>
        {canEdit && <button type="button" className="ghost" onClick={() => setEditing(!editing)}>{editing ? "Cancel edit" : "Edit"}</button>}
        {can("tickets.delete") && <button type="button" className="ghost danger-text" onClick={() => setConfirmDelete(true)}>Delete</button>}
      </PageHeader>
      <ErrorNote message={formError} />
      <div className="detail-layout">
        <div>
          <section className="panel pad">
            {editing ? (
              <form className="stack" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const f = new FormData(e.currentTarget); await patch({ title: f.get("title"), description: f.get("description"), dueDate: f.get("dueDate") || null }); setEditing(false); }}>
                <label>Title<input name="title" defaultValue={ticket.title} required maxLength={200} /></label>
                <label>Description<textarea name="description" defaultValue={ticket.description} rows={6} /></label>
                <label>Due date<input name="dueDate" type="date" defaultValue={ticket.dueDate?.slice(0, 10) ?? ""} /></label>
                <div className="modal-actions"><button>Save changes</button></div>
              </form>
            ) : <p className="description">{ticket.description || "No description provided."}</p>}
          </section>

          <section className="panel pad spaced">
            <h2>Comments</h2>
            {can("comments.view") ? data.comments.map((c) => (
              <div className="comment" key={c._id}>
                <strong>{c.authorId?.name ?? "User"}</strong> <small className="muted">{timeAgo(c.createdAt)}</small>
                <p>{c.body}</p>
                {(c.authorId?._id === user!.id || user!.role === "SUPERADMIN") && can("comments.delete") && <button type="button" className="link-button" onClick={() => void run(() => api(`/tickets/${id}/comments/${c._id}`, { method: "DELETE" }), "Comment deleted")}>Delete</button>}
              </div>
            )) : <p className="muted">You do not have permission to view comments.</p>}
            {!data.comments.length && can("comments.view") && <p className="muted">No comments yet.</p>}
            {can("comments.create") && (
              <form className="comment-form" onSubmit={async (e) => { e.preventDefault(); if (!comment.trim()) return; await run(() => api(`/tickets/${id}/comments`, { method: "POST", body: json({ body: comment }) })); setComment(""); }}>
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" aria-label="New comment" maxLength={10000} />
                <button>Add</button>
              </form>
            )}
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
            <dd>{canEdit && groups.length ? (
              <select aria-label="Group" value={groupId} onChange={(e) => void patch({ groupId: e.target.value || null }, "Ticket moved")}>
                <option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>) : ticket.groupId?.name ?? "No group"}</dd>
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
            {data.activities.map((a) => <p key={a._id}><span>{a.actorId?.name ?? "User"}</span> {label(a.type).toLowerCase()} <small className="muted">{timeAgo(a.createdAt)}</small></p>)}
          </div>
        </aside>
      </div>
      {confirmDelete && <ConfirmDialog title="Delete ticket" message="This removes the ticket for everyone. This cannot be undone from the app." confirmLabel="Delete ticket" onClose={() => setConfirmDelete(false)} onConfirm={async () => { try { await api(`/tickets/${id}`, { method: "DELETE" }); toast("Ticket deleted"); router.replace("/tickets"); } catch (e) { toast((e as Error).message, "error"); } }} />}
    </>
  );
}
