"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../../components/auth-provider";
import { AutomationsSection } from "../../../../components/automations-section";
import { MilestonesSection, WebhooksSection } from "../../../../components/group-extras";
import { Badge, Button, buttonClass, fieldClass, panelClass, rowClass, Tabs } from "../../../../components/controls";
import { ConfirmDialog } from "../../../../components/modal";
import { PageHeader } from "../../../../components/shell";
import { useToast } from "../../../../components/toast";
import { Avatar, ErrorNote, Skeleton } from "../../../../components/ui";
import { api, json } from "../../../../lib/api";
import { useLoad } from "../../../../lib/use-load";
import type { Group, Member, Person, Topic } from "../../../../lib/types";

type Detail = { group: Group; members: Member[]; topics: Topic[] };
type Tab = "members" | "topics" | "milestones" | "automations" | "integrations";

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
  if (error || !data) return <><PageHeader title="Group" crumbs={[{ label: "Groups", href: "/groups" }, { label: "Not found" }]} /><ErrorNote message={error || "Group not found"} /><Link href="/groups" className="text-sm font-semibold text-accent hover:underline">← Back to groups</Link></>;

  const { group, members, topics } = data;
  const admin = user!.role === "SUPERADMIN";
  const creator = admin || group.creatorIds.includes(user!.id);
  const manager = creator || group.leaderIds.includes(user!.id);
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "members", label: `Members (${members.length})`, show: true },
    { id: "topics", label: `Topics (${topics.filter((t) => !t.archivedAt).length})`, show: true },
    { id: "milestones", label: "Milestones", show: true },
    { id: "automations", label: "Automations", show: manager },
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

  const select = `${fieldClass.replace("w-full", "")} h-9 w-auto py-0`;
  const addForm = "flex flex-wrap gap-2 border-t border-line bg-soft/40 p-4";

  return (
    <>
      <PageHeader title={group.name} crumbs={[{ label: "Groups", href: "/groups" }, { label: group.name }]}>
        <Link href={`/tickets?group=${group.id}`} className={buttonClass("secondary", "sm")}>View tickets</Link>
        {creator && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm({ title: "Delete group", message: "Only groups without active tickets can be deleted. A SuperAdmin can restore it later.", label: "Delete group", action: async () => { await api(`/groups/${id}`, { method: "DELETE" }); router.replace("/groups"); } })}>Delete group</Button>}
      </PageHeader>
      {group.description && <p className="-mt-3 mb-6 max-w-3xl text-muted">{group.description}</p>}

      <Tabs label="Group sections" tabs={tabs.filter((t) => t.show)} value={tab} onChange={setTab} />

      {tab === "members" && (
        <section className={`${panelClass} overflow-hidden`}>
          {members.map((m) => {
            const role = roleOf(m);
            const self = m.id === user!.id;
            return (
              <div className={rowClass} key={m.id}>
                <Avatar name={m.name} size={36} />
                <div className="min-w-40 flex-1"><strong className="flex items-center gap-2">{m.name}{self && <Badge tone="accent">You</Badge>}</strong><small className="text-muted">{m.email}</small></div>
                {creator ? (
                  <select className={select} aria-label={`Role for ${m.name}`} value={role} onChange={(e) => { const next = e.target.value; void run(() => api(`/groups/${id}/roles/${m.id}`, { method: "PATCH", body: json({ creator: next === "creator", leader: next !== "member" }) }), "Role updated"); }}>
                    <option value="member">Member</option><option value="leader">Leader</option><option value="creator">Creator</option>
                  </select>
                ) : <Badge>{role[0].toUpperCase() + role.slice(1)}</Badge>}
                {(manager || self) && <Link href={`/reports?tab=people&person=${m.id}`} className={buttonClass("ghost", "sm")}>Work</Link>}
                {(manager || self) && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm({ title: self ? "Leave group" : "Remove member", message: `${self ? "You will" : `${m.name} will`} lose access to this group's tickets.`, label: self ? "Leave" : "Remove", action: () => api(`/groups/${id}/members/${m.id}`, { method: "DELETE" }).then(() => (self && !admin ? router.replace("/groups") : reload())) })}>{self ? "Leave" : "Remove"}</Button>}
              </div>
            );
          })}
          {manager && (
            <form className={addForm} onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const userId = new FormData(e.currentTarget).get("userId"); if (userId) void run(() => api(`/groups/${id}/members`, { method: "POST", body: json({ userId }) }), "Member added"); }}>
              <select className={`${fieldClass} min-w-56 flex-1`} name="userId" aria-label="Person to add" onFocus={() => !candidates.length && void loadCandidates()} defaultValue="">
                <option value="">Add a person…</option>{candidates.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.email}</option>)}
              </select>
              <Button type="submit">Add</Button>
            </form>
          )}
        </section>
      )}

      {tab === "topics" && (
        <section className={`${panelClass} overflow-hidden`}>
          <p className="border-b border-line px-5 py-3 text-[13px] text-muted">Topics tag tickets in this group. A ticket can have several.</p>
          {topics.map((t) => (
            <div className={rowClass} key={t.id}>
              <div className="min-w-40 flex-1"><strong className="flex items-center gap-2">{t.name}{t.archivedAt && <Badge>Archived</Badge>}</strong>{t.description && <small className="text-muted">{t.description}</small>}</div>
              {manager && <Button variant="ghost" size="sm" onClick={() => void run(() => api(`/groups/${id}/topics/${t.id}`, { method: "PATCH", body: json({ archived: !t.archivedAt }) }), t.archivedAt ? "Topic restored" : "Topic archived")}>{t.archivedAt ? "Restore" : "Archive"}</Button>}
            </div>
          ))}
          {!topics.length && <p className="p-5 text-muted">No topics yet.</p>}
          {manager && (
            <form className={addForm} onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get("name") ?? "").trim(); if (!name) return; await run(() => api(`/groups/${id}/topics`, { method: "POST", body: json({ name }) }), "Topic created"); form.reset(); }}>
              <input className={`${fieldClass} min-w-56 flex-1`} name="name" placeholder="New topic name" aria-label="New topic name" maxLength={120} />
              <Button type="submit">Add topic</Button>
            </form>
          )}
        </section>
      )}

      {tab === "milestones" && <MilestonesSection groupId={group.id} manager={manager} />}
      {tab === "automations" && manager && <AutomationsSection groupId={group.id} members={members} topics={topics} />}
      {tab === "integrations" && manager && <WebhooksSection groupId={group.id} />}

      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.label} onClose={() => setConfirm(null)} onConfirm={async () => { try { await confirm.action(); } catch (e) { toast((e as Error).message, "error"); } }} />}
    </>
  );
}
