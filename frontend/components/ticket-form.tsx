"use client";
import { Button, Field, fieldClass } from "./controls";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, json } from "../lib/api";
import { label } from "../lib/format";
import { PRIORITIES, type Group, type Member, type Milestone, type Person, type Topic } from "../lib/types";
import { MarkdownEditor } from "./markdown-editor";
import { useAuth } from "./auth-provider";
import { Modal } from "./modal";
import { useToast } from "./toast";
import { PersonPicker } from "./person-picker";
import { ErrorNote } from "./ui";

export function TicketForm({ defaultGroupId = "", onClose }: { defaultGroupId?: string; onClose: () => void }) {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [description, setDescription] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canAssign = can("tickets.assign");

  useEffect(() => {
    api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setTopicIds([]);
    setAssigneeIds([]);
    setMilestones([]);
    if (groupId) {
      api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`).then((d) => setMilestones(d.milestones.filter((m) => !m.closedAt))).catch(() => undefined);
      api<{ topics: Topic[]; members: Member[] }>(`/groups/${groupId}`)
        .then((d) => { setTopics(d.topics.filter((t) => !t.archivedAt)); setPeople(d.members); })
        .catch((e) => setError(e.message));
    } else {
      setTopics([]);
      if (canAssign) api<{ users: Person[] }>("/users/assignees").then((d) => setPeople(d.users)).catch(() => undefined);
    }
  }, [groupId, canAssign]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/tickets", {
        method: "POST",
        body: json({ title: f.get("title"), description, milestoneId: f.get("milestoneId") || null, priority: f.get("priority"), dueDate: f.get("dueDate") || null, groupId: groupId || null, topicIds, assigneeIds }),
      });
      toast("Ticket created");
      onClose();
      router.push(`/tickets/${created.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Create ticket" eyebrow="New work" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-5">
        <Field label="Title"><input className={fieldClass} name="title" required maxLength={200} placeholder="What needs to be done?" /></Field>
        <div className="grid gap-1.5"><span className="text-sm font-semibold">Description</span><MarkdownEditor value={description} onChange={setDescription} rows={4} placeholder="Add context, acceptance criteria, or useful notes…" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Group">
            <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group (private)</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label="Priority"><select className={fieldClass} name="priority" defaultValue="MEDIUM">{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
          <Field label="Due date"><input className={fieldClass} name="dueDate" type="date" /></Field>
        </div>
        {milestones.length > 0 && <Field label="Milestone"><select className={fieldClass} name="milestoneId" defaultValue=""><option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
        {topics.length > 0 && (
          <fieldset className="rounded-lg border border-line px-4 pb-3 pt-1"><legend className="px-1.5 text-[13px] font-semibold text-muted">Topics</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">{topics.map((t) => <label key={t.id} className="flex items-center gap-2 text-sm"><input className="size-4 accent-[var(--accent)]" type="checkbox" checked={topicIds.includes(t.id)} onChange={() => toggle(topicIds, setTopicIds, t.id)} />{t.name}</label>)}</div>
          </fieldset>
        )}
        {canAssign && people.length > 0 && (
          <div className="grid gap-1.5"><span className="text-sm font-semibold">Assign to</span><PersonPicker people={people} value={assigneeIds} onChange={setAssigneeIds} label="Assign to" empty="Unassigned" /></div>
        )}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create ticket"}</Button></div>
      </form>
    </Modal>
  );
}
