"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { CommentComposer } from "../../../../components/comment-composer";
import { Markdown } from "../../../../components/markdown";
import { MarkdownEditor } from "../../../../components/markdown-editor";
import { ConfirmDialog, Modal } from "../../../../components/modal";
import { PersonPicker } from "../../../../components/person-picker";
import { useLiveEvents } from "../../../../components/realtime";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Button, fieldClass, panelClass } from "../../../../components/controls";
import { Avatar, ErrorNote, PriorityPill, Skeleton, StatusPill, Tag } from "../../../../components/ui";
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
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [showLink, setShowLink] = useState(false);
  const [showSubtask, setShowSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [relating, setRelating] = useState(false);
  const [formError, setFormError] = useState("");
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

  useEffect(() => { if (ticket && !editingDesc) setDescription(ticket.description); }, [ticket, editingDesc]);

  async function patch(changes: Record<string, unknown>, message = "Saved") {
    setFormError("");
    try { await api(`/tickets/${id}`, { method: "PATCH", body: json(changes) }); toast(message); refresh(); return true; }
    catch (e) { setFormError((e as Error).message); return false; }
  }

  async function run(action: () => Promise<unknown>, message?: string) {
    try { await action(); if (message) toast(message); refresh(); } catch (e) { toast((e as Error).message, "error"); }
  }

  if (loading && !data) return <Skeleton rows={7} />;
  if (error || !data || !ticket) return <><PageHeader title="Ticket" crumbs={[{ label: "Tickets", href: "/tickets" }, { label: "Not found" }]} /><ErrorNote message={error || "Ticket not found"} /><Link href="/tickets" className="text-sm font-semibold text-accent hover:underline">← Back to tickets</Link></>;

  const assignees = assigneesOf(ticket);
  const assigned = assignees.map((p) => p._id);
  const canEdit = can("tickets.edit");
  const comments = [...olderComments, ...data.comments];
  const activities = [...data.activities, ...olderActivity];
  const hasMoreComments = moreComments ?? data.hasMoreComments;
  const hasMoreActivity = moreActivity ?? data.hasMoreActivity;
  const done = data.subtasks.filter((s) => s.status === "COMPLETED" || s.status === "CLOSED").length;
  const mentionable: Person[] = people.length ? people : assignees.map((p) => ({ id: p._id, name: p.name, email: p.email ?? "" }));
  const pickerPeople = people.length ? people : assignees.map((p) => ({ id: p._id, name: p.name, email: p.email ?? "" }));

  async function loadOlder<T>(path: string, key: "comments" | "activities", first: { _id: string } | undefined, apply: (items: T[], more: boolean) => void) {
    try {
      const res = await api<Record<string, unknown>>(`${path}?before=${first?._id ?? ""}`);
      apply(res[key] as T[], !!res.hasMore);
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const crumbs = [{ label: "Tickets", href: "/tickets" }, ...(ticket.groupId ? [{ label: ticket.groupId.name, href: `/tickets?group=${ticket.groupId._id}` }] : []), { label: ticket.ticketNumber }];

  const card = `${panelClass} p-5 md:p-6`;
  const h2 = "mb-3 flex items-center gap-2 text-base font-semibold";
  const countPill = "rounded-full bg-soft px-2 text-xs font-semibold text-muted";
  const linkRow = "flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0";
  const textBtn = "rounded text-[13px] font-semibold text-accent hover:underline";
  const prop = "grid grid-cols-[92px_minmax(0,1fr)] items-start gap-x-3 py-2.5 text-sm";
  const propLabel = "pt-1.5 text-[13px] font-medium text-muted";
  const chipSelect = `${fieldClass} h-9 py-0`;

  return (
    <>
      <PageHeader title={ticket.title} crumbs={crumbs}>
        <Button variant="secondary" size="sm" aria-pressed={data.watching} onClick={() => void run(() => api(`/tickets/${id}/watch`, { method: data.watching ? "DELETE" : "POST" }), data.watching ? "Stopped watching" : "Watching this ticket")}>{data.watching ? "Watching ✓" : "Watch"}</Button>
        {canEdit && !editingTitle && <Button variant="ghost" size="sm" onClick={() => setEditingTitle(true)}>Rename</Button>}
        <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(window.location.href).then(() => toast("Link copied"))}>Copy link</Button>
        {can("tickets.delete") && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
      </PageHeader>
      {data.parent && <p className="-mt-3 mb-5 text-muted">Subtask of <Link className="font-mono text-xs text-accent hover:underline" href={`/tickets/${data.parent.id}`}>{data.parent.ticketNumber}</Link> {data.parent.title}</p>}
      <ErrorNote message={formError} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="grid gap-5">
          <section className={card} aria-label="Description">
            {canEdit && editingTitle && (
              <form className="mb-4 flex gap-2" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const title = String(new FormData(e.currentTarget).get("title")).trim(); if (title && title !== ticket.title && !(await patch({ title }))) return; setEditingTitle(false); }}>
                <input className={`${fieldClass} text-lg font-semibold`} name="title" defaultValue={ticket.title} aria-label="Ticket title" maxLength={200} required autoFocus />
                <Button type="submit">Save</Button><Button variant="ghost" onClick={() => setEditingTitle(false)}>Cancel</Button>
              </form>
            )}
            {editingDesc ? (
              <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (await patch({ description })) setEditingDesc(false); }}>
                <MarkdownEditor value={description} onChange={setDescription} rows={9} />
                <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingDesc(false)}>Cancel</Button><Button type="submit">Save</Button></div>
              </form>
            ) : (
              <div className={canEdit ? "-m-2 cursor-text rounded-lg p-2 transition-colors hover:bg-hover" : ""} onClick={() => canEdit && setEditingDesc(true)} role={canEdit ? "button" : undefined} tabIndex={canEdit ? 0 : undefined} aria-label={canEdit ? "Edit description" : undefined} onKeyDown={(e) => { if (canEdit && e.key === "Enter") setEditingDesc(true); }}>
                {ticket.description ? <Markdown>{ticket.description}</Markdown> : <p className="text-muted">{canEdit ? "Click to add a description…" : "No description provided."}</p>}
              </div>
            )}
          </section>

          <section className={card} aria-label="Comments">
            <h2 className={h2}>Comments{comments.length > 0 && <span className={countPill}>{comments.length}{hasMoreComments ? "+" : ""}</span>}</h2>
            {hasMoreComments && <button type="button" className={`${textBtn} mb-3`} onClick={() => void loadOlder<Comment>(`/tickets/${id}/comments`, "comments", comments[0], (items, more) => { setOlderComments((c) => [...items, ...c]); setMoreComments(more); })}>Load earlier comments</button>}
            {can("comments.view") ? comments.map((c) => (
              <div className="flex gap-3 border-b border-line py-4 first:pt-0 last:border-0" data-testid="comment" key={c._id}>
                <Avatar name={c.authorId?.name ?? "?"} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline gap-2 text-sm"><strong>{c.authorId?.name ?? "User"}</strong><small className="text-muted">{timeAgo(c.createdAt)}</small></div>
                  <Markdown>{c.body}</Markdown>
                  {(c.authorId?._id === user!.id || user!.role === "SUPERADMIN") && can("comments.delete") && <div className="mt-1.5"><button type="button" className={`${textBtn} text-muted hover:text-danger`} onClick={() => void run(async () => { await api(`/tickets/${id}/comments/${c._id}`, { method: "DELETE" }); setOlderComments((o) => o.filter((x) => x._id !== c._id)); }, "Comment deleted")}>Delete</button></div>}
                </div>
              </div>
            )) : <p className="text-muted">You do not have permission to view comments.</p>}
            {!comments.length && can("comments.view") && <p className="mb-2 text-muted">No comments yet. Start the conversation.</p>}
            {can("comments.create") && <CommentComposer people={mentionable} onSubmit={(body, mentionIds) => api(`/tickets/${id}/comments`, { method: "POST", body: json({ body, mentionIds }) }).then(() => { setMoreComments(null); refresh(); })} />}
          </section>

          {(data.subtasks.length > 0 || showSubtask) && (
            <section className={card} aria-label="Subtasks">
              <h2 className={h2}>Subtasks{data.subtasks.length > 0 && <span className={countPill}>{done}/{data.subtasks.length} done</span>}</h2>
              {data.subtasks.length > 0 && <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={data.subtasks.length}><span className="block h-full rounded-full bg-pine transition-all" style={{ width: `${(done / data.subtasks.length) * 100}%` }} /></div>}
              {data.subtasks.map((s) => <Link key={s.id} href={`/tickets/${s.id}`} className={`${linkRow} hover:bg-hover`}><span><span className="mr-2 font-mono text-xs text-muted">{s.ticketNumber}</span>{s.title}</span><StatusPill status={s.status} /></Link>)}
              {can("tickets.create") && !data.parent && (
                <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!subtaskTitle.trim()) return; await run(() => api("/tickets", { method: "POST", body: json({ title: subtaskTitle, parentId: id, groupId: groupId || null, topicIds: [] }) }), "Subtask added"); setSubtaskTitle(""); }}>
                  <input className={fieldClass} value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Add a subtask…" aria-label="New subtask title" maxLength={200} autoFocus={showSubtask && !data.subtasks.length} />
                  <Button type="submit">Add</Button>
                </form>
              )}
            </section>
          )}

          {data.relations.length > 0 && (
            <section className={card} aria-label="Related tickets">
              <h2 className={h2}>Related tickets</h2>
              {data.relations.map((r) => (
                <div className={linkRow} key={`${r.type}${r.id}`}>
                  <Link href={`/tickets/${r.id}`} className="hover:underline"><span className="mr-2 rounded border border-line-strong px-1.5 text-[11px] font-semibold text-muted">{{ blocks: "Needed by", blockedBy: "Waiting on", relates: "Related" }[r.type]}</span><span className="mr-2 font-mono text-xs text-muted">{r.ticketNumber}</span>{r.title}</Link>
                  {canEdit && <button type="button" className={textBtn} onClick={() => void run(() => api(`/tickets/${id}/relations/${r.id}`, { method: "DELETE" }), "Relation removed")}>Remove</button>}
                </div>
              ))}
            </section>
          )}

          {(data.links.length > 0 || showLink) && can("ticket_links.view") && (
            <section className={card} aria-label="Links">
              <h2 className={h2}>Links</h2>
              {data.links.map((l) => (
                <div className={linkRow} key={l._id}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">{l.label}</a>
                  {can("ticket_links.delete") && <button type="button" className={textBtn} onClick={() => void run(() => api(`/tickets/${id}/links/${l._id}`, { method: "DELETE" }), "Link removed")}>Remove</button>}
                </div>
              ))}
              {can("ticket_links.create") && (
                <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]" onSubmit={async (e) => { e.preventDefault(); await run(() => api(`/tickets/${id}/links`, { method: "POST", body: json(linkDraft) }), "Link added"); setLinkDraft({ label: "", url: "" }); }}>
                  <input className={fieldClass} placeholder="Label" aria-label="Link label" value={linkDraft.label} onChange={(e) => setLinkDraft({ ...linkDraft, label: e.target.value })} required maxLength={120} autoFocus={showLink && !data.links.length} />
                  <input className={fieldClass} placeholder="https://…" aria-label="Link URL" type="url" value={linkDraft.url} onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })} required />
                  <Button type="submit">Add link</Button>
                </form>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {!data.subtasks.length && !showSubtask && !data.parent && can("tickets.create") && <button type="button" className={textBtn} onClick={() => setShowSubtask(true)}>+ Add subtask</button>}
            {canEdit && <button type="button" className={textBtn} onClick={() => setRelating(true)}>+ Relate a ticket</button>}
            {!data.links.length && !showLink && can("ticket_links.create") && <button type="button" className={textBtn} onClick={() => setShowLink(true)}>+ Add link</button>}
          </div>

          <details className={`${card} group`}>
            <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden"><span className="text-muted transition-transform group-open:rotate-90">▸</span>Activity<span className={countPill}>{activities.length}{hasMoreActivity ? "+" : ""}</span></summary>
            <ol className="mt-4 grid gap-3 border-l border-line pl-4">
              {activities.map((a) => <li key={a._id} className="relative text-[13px] text-muted before:absolute before:-left-[21px] before:top-1.5 before:size-2 before:rounded-full before:bg-line-strong"><span className="font-semibold text-ink">{a.actorId?.name ?? "User"}</span> {label(a.type).toLowerCase()} <small>· {timeAgo(a.createdAt)}</small></li>)}
            </ol>
            {hasMoreActivity && <button type="button" className={`${textBtn} mt-3`} onClick={() => void loadOlder<Activity>(`/tickets/${id}/activity`, "activities", activities[activities.length - 1], (items, more) => { setOlderActivity((o) => [...o, ...items]); setMoreActivity(more); })}>Show older activity</button>}
          </details>
        </div>

        <aside className={`${panelClass} p-5 lg:sticky lg:top-20`} aria-label="Details">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">Details</h2>
          <div className="divide-y divide-line">
            <div className={prop}><span className={propLabel}>Status</span><div>{can("tickets.change_status") ? <select className={chipSelect} aria-label="Status" value={ticket.status} onChange={(e) => void patch({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select> : <StatusPill status={ticket.status} />}</div></div>
            <div className={prop}><span className={propLabel}>Priority</span><div>{can("tickets.change_priority") ? <select className={chipSelect} aria-label="Priority" value={ticket.priority} onChange={(e) => void patch({ priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select> : <PriorityPill priority={ticket.priority} />}</div></div>
            <div className={prop}><span className={propLabel}>Assignees</span><div className="pt-1">{can("tickets.assign") && pickerPeople.length ? <PersonPicker people={pickerPeople} value={assigned} onChange={(ids) => void patch({ assigneeIds: ids }, "Assignees updated")} label="Assignees" empty="Unassigned" /> : assignees.map((p) => p.name).join(", ") || "Unassigned"}</div></div>
            <div className={prop}><span className={propLabel}>Due</span><div>{canEdit ? <input className={`${fieldClass} h-9 py-0`} type="date" aria-label="Due date" value={ticket.dueDate?.slice(0, 10) ?? ""} onChange={(e) => void patch({ dueDate: e.target.value || null })} /> : <span className="inline-block pt-1.5">{formatDate(ticket.dueDate)}</span>}</div></div>
            <div className={prop}><span className={propLabel}>Group</span><div>{canEdit && groups.length > 0 && !data.parent && !data.subtasks.length ? (
              <select className={chipSelect} aria-label="Group" value={groupId} onChange={(e) => void patch({ groupId: e.target.value || null }, "Ticket moved")}>
                <option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>) : <span className="inline-block pt-1.5">{ticket.groupId?.name ?? "No group"}</span>}</div></div>
            {(milestones.length > 0 || ticket.milestoneId) && <div className={prop}><span className={propLabel}>Milestone</span><div>{canEdit && milestones.length ? (
              <select className={chipSelect} aria-label="Milestone" value={ticket.milestoneId?._id ?? ""} onChange={(e) => void patch({ milestoneId: e.target.value || null })}>
                <option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>) : <span className="inline-block pt-1.5">{ticket.milestoneId?.name ?? "—"}</span>}</div></div>}
            {(topics.length > 0 || (ticket.topicIds?.length ?? 0) > 0) && <div className={prop}><span className={propLabel}>Topics</span><div>{canEdit && topics.length ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">{topics.map((t) => {
                const on = ticket.topicIds?.some((x) => x._id === t.id);
                return <label key={t.id} className="flex items-center gap-2 text-sm font-normal"><input className="size-4 accent-[var(--accent)]" type="checkbox" checked={!!on} onChange={() => void patch({ topicIds: (ticket.topicIds ?? []).map((x) => x._id).filter((x) => x !== t.id).concat(on ? [] : [t.id]) })} />{t.name}</label>;
              })}</div>) : <div className="flex flex-wrap gap-1 pt-1.5">{ticket.topicIds?.map((t) => <Tag key={t._id}>{t.name}</Tag>)}</div>}</div></div>}
            <div className={prop}><span className={propLabel}>Created</span><span className="pt-1.5 text-muted">{formatDate(ticket.createdAt)} by {ticket.createdById?.name ?? "—"}</span></div>
          </div>
        </aside>
      </div>
      {relating && <RelateDialog ticketId={id} onClose={() => setRelating(false)} onDone={() => { setRelating(false); refresh(); }} />}
      {confirmDelete && <ConfirmDialog title="Delete ticket" message="The ticket disappears for everyone. You can undo right after deleting." confirmLabel="Delete ticket" onClose={() => setConfirmDelete(false)} onConfirm={async () => {
        try {
          await api(`/tickets/${id}`, { method: "DELETE" });
          toast("Ticket deleted", "success", { label: "Undo", run: async () => { await api("/tickets/restore", { method: "POST", body: json({ ids: [id] }) }); router.push(`/tickets/${id}`); } });
          router.replace("/tickets");
        } catch (e) { toast((e as Error).message, "error"); }
      }} />}
    </>
  );
}

function RelateDialog({ ticketId, onClose, onDone }: { ticketId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("WAITS_ON");
  const [results, setResults] = useState<{ id: string; ticketNumber: string; title: string }[]>([]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => api<{ tickets: typeof results }>(`/search?q=${encodeURIComponent(query)}`).then((d) => setResults(d.tickets.filter((t) => t.id !== ticketId))).catch(() => undefined), 250);
    return () => clearTimeout(timer);
  }, [query, ticketId]);

  return (
    <Modal title="Relate to another ticket" onClose={onClose}>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold">Relationship<select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)}><option value="WAITS_ON">This ticket waits on…</option><option value="BLOCKS">This ticket is needed by…</option><option value="RELATES">Is related to…</option></select></label>
        <label className="grid gap-1.5 text-sm font-semibold">Find a ticket<input className={fieldClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Number or title" autoFocus /></label>
        <ul className="grid gap-1">
          {results.map((t) => <li key={t.id}><button type="button" className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-3 py-2 text-left text-sm font-medium text-ink hover:bg-hover" onClick={async () => { try { await api(`/tickets/${ticketId}/relations`, { method: "POST", body: json({ type, ticketId: t.id }) }); toast("Tickets related"); onDone(); } catch (e) { toast((e as Error).message, "error"); } }}><span className="font-mono text-xs text-muted">{t.ticketNumber}</span>{t.title}</button></li>)}
        </ul>
      </div>
    </Modal>
  );
}
