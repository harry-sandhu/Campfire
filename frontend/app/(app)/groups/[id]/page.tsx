"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { ConfirmDialog } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Avatar, ErrorNote, Spinner } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { useLoad } from "../../../../lib/use-load";
import type { Group, Member, Person, Topic } from "../../../../lib/types";

type Detail = { group: Group; members: Member[]; topics: Topic[] };

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Detail>(`/groups/${id}`), [id]);
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; action: () => Promise<unknown> }>(null);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <><PageHeader title="Group" /><ErrorNote message={error || "Group not found"} /><Link href="/groups" className="link-button">← Back to groups</Link></>;

  const { group, members, topics } = data;
  const admin = user!.role === "SUPERADMIN";
  const creator = admin || group.creatorIds.includes(user!.id);
  const manager = creator || group.leaderIds.includes(user!.id);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); toast(message); reload(); } catch (e) { toast((e as Error).message, "error"); }
  };

  async function loadCandidates() {
    try {
      const d = await api<{ users: Person[] }>("/users/assignees");
      setCandidates(d.users.filter((u) => !group.memberIds.includes(u.id)));
    } catch { toast("You need the tickets.assign permission to browse people to add.", "error"); }
  }

  return (
    <>
      <PageHeader eyebrow="GROUP" title={group.name}>
        <Link href="/groups" className="ghost link-button">← Groups</Link>
        <Link href={`/tickets?group=${group.id}`} className="ghost link-button">View tickets</Link>
        {creator && <button type="button" className="ghost danger-text" onClick={() => setConfirm({ title: "Delete group", message: "Only groups without active tickets can be deleted.", label: "Delete group", action: async () => { await api(`/groups/${id}`, { method: "DELETE" }); router.replace("/groups"); } })}>Delete group</button>}
      </PageHeader>
      {group.description && <p className="muted lead">{group.description}</p>}

      <section className="panel">
        <div className="panel-head"><div><h2>Members</h2><p className="muted">{members.length} people</p></div></div>
        <div className="people-list">
          {members.map((m) => {
            const isCreator = group.creatorIds.includes(m.id);
            const isLeader = group.leaderIds.includes(m.id);
            return (
              <div className="person-row" key={m.id}>
                <Avatar name={m.name} />
                <div><strong>{m.name}</strong><small>{m.email}</small></div>
                <span className="status">{isCreator ? "Creator" : isLeader ? "Leader" : "Member"}</span>
                {creator && <button type="button" className="ghost" onClick={() => void run(() => api(`/groups/${id}/roles/${m.id}`, { method: "PATCH", body: json({ leader: !isLeader }) }), "Role updated")}>{isLeader ? "Remove leader" : "Make leader"}</button>}
                {creator && <button type="button" className="ghost" onClick={() => void run(() => api(`/groups/${id}/roles/${m.id}`, { method: "PATCH", body: json({ creator: !isCreator }) }), "Role updated")}>{isCreator ? "Remove creator" : "Make creator"}</button>}
                {(manager || m.id === user!.id) && <button type="button" className="ghost danger-text" onClick={() => setConfirm({ title: m.id === user!.id ? "Leave group" : "Remove member", message: `${m.id === user!.id ? "You will" : `${m.name} will`} lose access to this group's tickets.`, label: "Confirm", action: () => api(`/groups/${id}/members/${m.id}`, { method: "DELETE" }).then(() => (m.id === user!.id && !admin ? router.replace("/groups") : reload())) })}>{m.id === user!.id ? "Leave" : "Remove"}</button>}
              </div>
            );
          })}
        </div>
        {manager && (
          <form className="add-member" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const userId = new FormData(e.currentTarget).get("userId"); if (userId) void run(() => api(`/groups/${id}/members`, { method: "POST", body: json({ userId }) }), "Member added"); }}>
            <select name="userId" aria-label="Person to add" onFocus={() => !candidates.length && void loadCandidates()} defaultValue="">
              <option value="">Add a person…</option>{candidates.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}
            </select>
            <button>Add member</button>
          </form>
        )}
      </section>

      <section className="panel spaced">
        <div className="panel-head"><div><h2>Topics</h2><p className="muted">Tag tickets with one or more topics.</p></div></div>
        <div className="people-list">
          {topics.map((t) => (
            <div className="person-row" key={t.id}>
              <div><strong>{t.name}{t.archivedAt && <span className="chip">Archived</span>}</strong>{t.description && <small>{t.description}</small>}</div>
              {manager && <button type="button" className="ghost" onClick={() => void run(() => api(`/groups/${id}/topics/${t.id}`, { method: "PATCH", body: json({ archived: !t.archivedAt }) }), t.archivedAt ? "Topic restored" : "Topic archived")}>{t.archivedAt ? "Restore" : "Archive"}</button>}
            </div>
          ))}
          {!topics.length && <p className="muted pad">No topics yet.</p>}
        </div>
        {manager && (
          <form className="add-member" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get("name") ?? "").trim(); if (!name) return; await run(() => api(`/groups/${id}/topics`, { method: "POST", body: json({ name }) }), "Topic created"); form.reset(); }}>
            <input name="name" placeholder="New topic name" aria-label="New topic name" maxLength={120} />
            <button>Add topic</button>
          </form>
        )}
      </section>
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} onClose={() => setConfirm(null)} onConfirm={async () => { try { await confirm.action(); } catch (e) { toast((e as Error).message, "error"); } }} />}
    </>
  );
}
