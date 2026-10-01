"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { MilestonesSection, WebhooksSection } from "../../../../components/group-extras";
import { ConfirmDialog } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Avatar, ErrorNote, Skeleton } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { useLoad } from "../../../../lib/use-load";
import type { Group, Member, Person, Topic } from "../../../../lib/types";

type Detail = { group: Group; members: Member[]; topics: Topic[] };
type Tab = "members" | "topics" | "milestones" | "integrations";

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<Detail>(`/groups/${id}`), [id]);
  const [tab, setTab] = useState<Tab>("members");
  const [candidates, setCandidates] = useState<Person[]>([]);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; action: () => Promise<unknown> }>(null);

  if (loading && !data) return <Skeleton rows={5} />;
  if (error || !data) return <><PageHeader title="Group" crumbs={[{ label: "Groups", href: "/groups" }, { label: "Not found" }]} /><ErrorNote message={error || "Group not found"} /><Link href="/groups" className="link-button">← Back to groups</Link></>;

  const { group, members, topics } = data;
  const admin = user!.role === "SUPERADMIN";
  const creator = admin || group.creatorIds.includes(user!.id);
  const manager = creator || group.leaderIds.includes(user!.id);
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "members", label: `Members (${members.length})`, show: true },
    { id: "topics", label: `Topics (${topics.filter((t) => !t.archivedAt).length})`, show: true },
    { id: "milestones", label: "Milestones", show: true },
    { id: "integrations", label: "Integrations", show: manager },
  ];

  const run = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); toast(message); reload(); } catch (e) { toast((e as Error).message, "error"); }
  };

  async function loadCandidates() {
    try {
      const d = await api<{ users: Person[] }>("/users/assignees");
      setCandidates(d.users.filter((u) => !group.memberIds.includes(u.id)));
    } catch { toast("You need the tickets.assign permission to browse people to add.", "error"); }
  }

  const roleOf = (m: Member) => (group.creatorIds.includes(m.id) ? "creator" : group.leaderIds.includes(m.id) ? "leader" : "member");

  return (
    <>
      <PageHeader title={group.name} crumbs={[{ label: "Groups", href: "/groups" }, { label: group.name }]}>
        <Link href={`/tickets?group=${group.id}`} className="ghost">View tickets</Link>
        {creator && <button type="button" className="ghost danger-text" onClick={() => setConfirm({ title: "Delete group", message: "Only groups without active tickets can be deleted. A SuperAdmin can restore it later.", label: "Delete group", action: async () => { await api(`/groups/${id}`, { method: "DELETE" }); router.replace("/groups"); } })}>Delete group</button>}
      </PageHeader>
      {group.description && <p className="lead" style={{ marginTop: -12 }}>{group.description}</p>}

      <div className="tabs" role="tablist" aria-label="Group sections">
        {tabs.filter((t) => t.show).map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === "members" && (
        <section className="panel">
          <div className="people-list">
            {members.map((m) => {
              const role = roleOf(m);
              const self = m.id === user!.id;
              return (
                <div className="person-row" key={m.id}>
                  <Avatar name={m.name} size={32} />
                  <div><strong>{m.name}{self && <span className="chip">You</span>}</strong><small>{m.email}</small></div>
                  {creator ? (
                    <select className="chip-select" aria-label={`Role for ${m.name}`} value={role} style={{ width: "auto" }} onChange={(e) => { const next = e.target.value; void run(() => api(`/groups/${id}/roles/${m.id}`, { method: "PATCH", body: json({ creator: next === "creator", leader: next !== "member" }) }), "Role updated"); }}>
                      <option value="member">Member</option><option value="leader">Leader</option><option value="creator">Creator</option>
                    </select>
                  ) : <span className="status">{role[0].toUpperCase() + role.slice(1)}</span>}
                  {(manager || self) && <button type="button" className="ghost danger-text" onClick={() => setConfirm({ title: self ? "Leave group" : "Remove member", message: `${self ? "You will" : `${m.name} will`} lose access to this group's tickets.`, label: self ? "Leave" : "Remove", action: () => api(`/groups/${id}/members/${m.id}`, { method: "DELETE" }).then(() => (self && !admin ? router.replace("/groups") : reload())) })}>{self ? "Leave" : "Remove"}</button>}
                </div>
              );
            })}
          </div>
          {manager && (
            <form className="add-member" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const userId = new FormData(e.currentTarget).get("userId"); if (userId) void run(() => api(`/groups/${id}/members`, { method: "POST", body: json({ userId }) }), "Member added"); }}>
              <select name="userId" aria-label="Person to add" onFocus={() => !candidates.length && void loadCandidates()} defaultValue="">
                <option value="">Add a person…</option>{candidates.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}
              </select>
              <button>Add</button>
            </form>
          )}
        </section>
      )}

      {tab === "topics" && (
        <section className="panel">
          <p className="note">Topics tag tickets in this group. A ticket can have several.</p>
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
      )}

      {tab === "milestones" && <MilestonesSection groupId={group.id} manager={manager} />}
      {tab === "integrations" && manager && <WebhooksSection groupId={group.id} />}

      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} onClose={() => setConfirm(null)} onConfirm={async () => { try { await confirm.action(); } catch (e) { toast((e as Error).message, "error"); } }} />}
    </>
  );
}
