"use client";
import { useState } from "react";
import { api, json } from "../lib/api";
import { ACTION_LABELS, RECIPES, TRIGGER_LABELS, type Recipe } from "../lib/automation-recipes";
import { formatDate, label, timeAgo } from "../lib/format";
import { useLoad } from "../lib/use-load";
import { PRIORITIES, STATUSES, type Automation, type AutomationAction, type AutomationCondition, type AutomationInput, type AutomationRun, type Member, type Milestone, type Topic } from "../lib/types";
import { Badge, Button, Field, fieldClass, rowClass } from "./controls";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { ErrorNote, Panel } from "./ui";

type Props = { groupId: string; members: Member[]; topics: Topic[] };

const blank = (): AutomationInput => ({ name: "", trigger: { type: "ticket.created" }, conditions: [], actions: [{ type: "notify_leaders" }] });
const sel = `${fieldClass.replace("w-full", "")} h-9 w-auto min-w-0 py-0`;

function summary(a: AutomationInput, members: Member[]) {
  const who = (id?: string) => members.find((m) => m.id === id)?.name ?? "someone";
  const t = a.trigger;
  const when = `${TRIGGER_LABELS[t.type] ?? t.type}${t.to ? ` → ${label(t.to)}` : ""}${t.type === "ticket.stuck" ? ` (${label(t.status ?? "BLOCKED")}, ${t.days ?? 3}d)` : ""}`;
  const ifs = a.conditions.map((c) => `${c.field} ${c.op === "is" ? "is" : "is not"} ${c.field === "assignee" && c.value !== "nobody" ? who(c.value) : label(c.value)}`);
  const thens = a.actions.map((x) => `${ACTION_LABELS[x.type] ?? x.type}${x.userId ? ` (${who(x.userId)})` : ""}${x.priority ? ` ${label(x.priority)}` : ""}${x.status ? ` ${label(x.status)}` : ""}`);
  return { when, ifs, thens };
}

export function AutomationsSection({ groupId, members, topics }: Props) {
  const toast = useToast();
  const base = `/groups/${groupId}/automations`;
  const { data, error, reload } = useLoad(() => api<{ automations: Automation[]; limit: number }>(base), [groupId]);
  const milestones = useLoad(() => api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`), [groupId]).data?.milestones ?? [];
  const [gallery, setGallery] = useState(false);
  const [picked, setPicked] = useState<Recipe | null>(null);
  const [editing, setEditing] = useState<{ id?: string; value: AutomationInput } | null>(null);
  const [runsFor, setRunsFor] = useState<Automation | null>(null);
  const [removing, setRemoving] = useState<Automation | null>(null);

  const save = async (input: AutomationInput, id?: string) => {
    await api(id ? `${base}/${id}` : base, { method: id ? "PATCH" : "POST", body: json(input) });
    toast(id ? "Automation saved" : "Automation added");
    setEditing(null);
    setPicked(null);
    setGallery(false);
    reload();
  };

  return (
    <Panel title="Automations" description="When something happens to a ticket, do something automatically. Pick a recipe or build your own. Runs as this group; people and milestones must belong to it."
      action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setGallery(true)}>Recipes</Button><Button onClick={() => setEditing({ value: blank() })}>Build your own</Button></div>}>
      <div className="px-4"><ErrorNote message={error} /></div>
      {data?.automations.map((a) => {
        const s = summary(a, members);
        return (
          <div className={rowClass} key={a.id}>
            <div className="min-w-56 flex-1">
              <strong className="flex flex-wrap items-center gap-2">{a.name}{!a.active && <Badge>Paused</Badge>}{a.failCount > 0 && <Badge tone="danger">{a.failCount} failed</Badge>}</strong>
              <small className="block text-muted"><b className="font-semibold text-ink">When</b> {s.when}{s.ifs.length ? <> · <b className="font-semibold text-ink">If</b> {s.ifs.join(" and ")}</> : null} · <b className="font-semibold text-ink">Then</b> {s.thens.join(", ")}</small>
              <small className="block text-muted">{a.runCount ? `Ran ${a.runCount} time${a.runCount === 1 ? "" : "s"}${a.lastRunAt ? `, last ${timeAgo(a.lastRunAt)}` : ""}` : "Has not run yet"}</small>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setRunsFor(a)}>History</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing({ id: a.id, value: { name: a.name, trigger: a.trigger, conditions: a.conditions, actions: a.actions } })}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => void api(`${base}/${a.id}`, { method: "PATCH", body: json({ active: !a.active }) }).then(reload).catch((e: Error) => toast(e.message, "error"))}>{a.active ? "Pause" : "Resume"}</Button>
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(a)}>Delete</Button>
          </div>
        );
      })}
      {data && !data.automations.length && <p className="p-5 text-muted">No automations yet. Start with a recipe.</p>}

      {gallery && !picked && (
        <Modal title="Recipes" eyebrow="Automations" onClose={() => setGallery(false)}>
          <div className="grid gap-2.5">
            {RECIPES.map((r) => (
              <button key={r.id} type="button" className="rounded-lg border border-line bg-card p-3.5 text-left transition hover:border-line-strong hover:bg-hover" onClick={() => (r.needs?.length ? setPicked(r) : void save(r.build({})).catch((e: Error) => toast(e.message, "error")))}>
                <strong className="block text-sm">{r.title}</strong><span className="text-[13px] text-muted">{r.description}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {picked && <RecipeBlanks recipe={picked} members={members} milestones={milestones} onClose={() => setPicked(null)} onSave={(input) => save(input)} />}
      {editing && <Builder initial={editing.value} members={members} topics={topics} milestones={milestones} groupId={groupId} id={editing.id} onClose={() => setEditing(null)} onSave={(input) => save(input, editing.id)} />}
      {runsFor && <Runs automation={runsFor} base={base} onClose={() => setRunsFor(null)} />}
      {removing && <ConfirmDialog title="Delete automation" message={`Delete “${removing.name}”? Its history is removed too.`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`${base}/${removing.id}`, { method: "DELETE" }).then(() => { toast("Automation deleted"); reload(); })} />}
    </Panel>
  );
}

function RecipeBlanks({ recipe, members, milestones, onClose, onSave }: { recipe: Recipe; members: Member[]; milestones: Milestone[]; onClose: () => void; onSave: (input: AutomationInput) => Promise<void> }) {
  const [userId, setUserId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [error, setError] = useState("");
  return (
    <Modal title={recipe.title} eyebrow="Recipe" onClose={onClose}>
      <form className="grid gap-5" onSubmit={async (e) => { e.preventDefault(); try { await onSave(recipe.build({ userId, milestoneId })); } catch (err) { setError((err as Error).message); } }}>
        <p className="text-muted">{recipe.description}</p>
        {recipe.needs?.includes("person") && <Field label="Person"><select className={fieldClass} required value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Choose…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
        {recipe.needs?.includes("milestone") && <Field label="Milestone"><select className={fieldClass} required value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}><option value="">Choose…</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Turn on</Button></div>
      </form>
    </Modal>
  );
}

/** The form builder: one When, any number of Ifs, up to five Thens. */
function Builder({ initial, members, topics, milestones, groupId, id, onClose, onSave }: { initial: AutomationInput; members: Member[]; topics: Topic[]; milestones: Milestone[]; groupId: string; id?: string; onClose: () => void; onSave: (input: AutomationInput) => Promise<void> }) {
  const [value, setValue] = useState<AutomationInput>(initial);
  const [error, setError] = useState("");
  const [testTicket, setTestTicket] = useState("");
  const [testResult, setTestResult] = useState("");
  const setTrigger = (patch: Partial<AutomationInput["trigger"]>) => setValue((v) => ({ ...v, trigger: { ...v.trigger, ...patch } }));
  const setCond = (i: number, patch: Partial<AutomationCondition>) => setValue((v) => ({ ...v, conditions: v.conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)) }));
  const setAct = (i: number, next: AutomationAction) => setValue((v) => ({ ...v, actions: v.actions.map((a, n) => (n === i ? next : a)) }));
  const t = value.trigger;

  async function test() {
    setTestResult("");
    try {
      const found = await api<{ tickets: { id: string }[] }>(`/tickets?groupId=${groupId}&search=${encodeURIComponent(testTicket)}&limit=1`);
      if (!found.tickets[0]) return setTestResult("No ticket matches that search.");
      const r = await api<{ matches: boolean; steps: string[] }>(`/groups/${groupId}/automations/${id}/test`, { method: "POST", body: json({ ticketId: found.tickets[0].id }) });
      setTestResult(r.matches ? `Conditions match. It would: ${r.steps.join(", ")}.` : "Conditions do not match this ticket. Nothing would happen.");
    } catch (e) { setTestResult((e as Error).message); }
  }

  const valueInput = (c: AutomationCondition, i: number) => {
    if (c.field === "priority") return <select className={sel} aria-label="Priority" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>;
    if (c.field === "status") return <select className={sel} aria-label="Status" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>{STATUSES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>;
    if (c.field === "topic") return <select className={sel} aria-label="Topic" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>{topics.filter((x) => !x.archivedAt).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>;
    return <select className={sel} aria-label="Assignee" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}><option value="nobody">Nobody</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>;
  };
  const defaultFor = (field: AutomationCondition["field"]) => (field === "priority" ? "URGENT" : field === "status" ? "BLOCKED" : field === "topic" ? topics.find((x) => !x.archivedAt)?.id ?? "" : "nobody");

  const step = "grid gap-2 rounded-lg border border-line bg-soft/40 p-3";
  const tag = "text-[11px] font-bold uppercase tracking-widest text-muted";
  return (
    <Modal title={id ? "Edit automation" : "Build an automation"} eyebrow="Automations" onClose={onClose}>
      <form className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); try { await onSave(value); } catch (err) { setError((err as Error).message); } }}>
        <Field label="Name"><input className={fieldClass} required maxLength={120} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} placeholder="Urgent tickets go to the leaders" /></Field>

        <div className={step}>
          <span className={tag}>When</span>
          <div className="flex flex-wrap items-center gap-2">
            <select className={sel} aria-label="Trigger" value={t.type} onChange={(e) => setValue({ ...value, trigger: { type: e.target.value } })}>{Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {t.type === "ticket.status_changed" && <select className={sel} aria-label="To status" value={t.to ?? ""} onChange={(e) => setTrigger({ to: e.target.value || undefined })}><option value="">to anything</option>{STATUSES.map((s) => <option key={s} value={s}>to {label(s)}</option>)}</select>}
            {t.type === "ticket.priority_changed" && <select className={sel} aria-label="To priority" value={t.to ?? ""} onChange={(e) => setTrigger({ to: e.target.value || undefined })}><option value="">to anything</option>{PRIORITIES.map((s) => <option key={s} value={s}>to {label(s)}</option>)}</select>}
            {t.type === "ticket.stuck" && <>
              <select className={sel} aria-label="Status" value={t.status ?? "BLOCKED"} onChange={(e) => setTrigger({ status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>in {label(s)}</option>)}</select>
              <label className="flex items-center gap-1.5 text-sm">for <input className={`${fieldClass.replace("w-full", "")} h-9 w-16 py-0`} type="number" min={1} max={90} value={t.days ?? 3} onChange={(e) => setTrigger({ days: Number(e.target.value) || 1 })} aria-label="Days" /> days (untouched)</label>
            </>}
          </div>
        </div>

        <div className={step}>
          <span className={tag}>If <span className="font-normal normal-case tracking-normal">(optional)</span></span>
          {value.conditions.map((c, i) => (
            <div className="flex flex-wrap items-center gap-2" key={i}>
              <select className={sel} aria-label="Field" value={c.field} onChange={(e) => setCond(i, { field: e.target.value as AutomationCondition["field"], value: defaultFor(e.target.value as AutomationCondition["field"]) })}><option value="priority">Priority</option><option value="status">Status</option><option value="assignee">Assignee</option><option value="topic">Topic</option></select>
              <select className={sel} aria-label="Operator" value={c.op} onChange={(e) => setCond(i, { op: e.target.value as "is" | "is_not" })}><option value="is">is</option><option value="is_not">is not</option></select>
              {valueInput(c, i)}
              <Button variant="ghost" size="sm" onClick={() => setValue({ ...value, conditions: value.conditions.filter((_, n) => n !== i) })}>Remove</Button>
            </div>
          ))}
          {value.conditions.length < 5 && <div><Button variant="subtle" size="sm" onClick={() => setValue({ ...value, conditions: [...value.conditions, { field: "priority", op: "is", value: "URGENT" }] })}>+ Add a condition</Button></div>}
        </div>

        <div className={step}>
          <span className={tag}>Then</span>
          {value.actions.map((a, i) => (
            <div className="flex flex-wrap items-center gap-2" key={i}>
              <select className={sel} aria-label="Action" value={a.type} onChange={(e) => setAct(i, { type: e.target.value })}>{Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              {(a.type === "notify_user" || a.type === "assign") && <select className={sel} aria-label="Person" required value={a.userId ?? ""} onChange={(e) => setAct(i, { ...a, userId: e.target.value })}><option value="">Choose a person…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
              {a.type === "set_priority" && <select className={sel} aria-label="Priority" value={a.priority ?? ""} required onChange={(e) => setAct(i, { ...a, priority: e.target.value })}><option value="">Choose…</option>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>}
              {a.type === "set_status" && <select className={sel} aria-label="Status" value={a.status ?? ""} required onChange={(e) => setAct(i, { ...a, status: e.target.value })}><option value="">Choose…</option>{STATUSES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select>}
              {a.type === "set_milestone" && <select className={sel} aria-label="Milestone" value={a.milestoneId ?? ""} required onChange={(e) => setAct(i, { ...a, milestoneId: e.target.value })}><option value="">Choose…</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
              {["notify_user", "notify_leaders", "notify_assignees", "post_slack"].includes(a.type) && <input className={`${fieldClass} h-9 min-w-48 flex-1 py-0`} aria-label="Message" maxLength={300} placeholder="Message (optional). {ticket} and {title} fill in." value={a.message ?? ""} onChange={(e) => setAct(i, { ...a, message: e.target.value })} />}
              {a.type === "add_comment" && <input className={`${fieldClass} h-9 min-w-48 flex-1 py-0`} aria-label="Comment" required maxLength={2000} placeholder="Comment text. {ticket} and {title} fill in." value={a.body ?? ""} onChange={(e) => setAct(i, { ...a, body: e.target.value })} />}
              {value.actions.length > 1 && <Button variant="ghost" size="sm" onClick={() => setValue({ ...value, actions: value.actions.filter((_, n) => n !== i) })}>Remove</Button>}
            </div>
          ))}
          {value.actions.length < 5 && <div><Button variant="subtle" size="sm" onClick={() => setValue({ ...value, actions: [...value.actions, { type: "notify_leaders" }] })}>+ Add an action</Button></div>}
        </div>

        {id && (
          <div className="grid gap-2">
            <span className={tag}>Try it on a ticket (changes nothing)</span>
            <div className="flex gap-2"><input className={`${fieldClass} h-9 flex-1 py-0`} aria-label="Ticket to test" placeholder="Ticket number or words from its title" value={testTicket} onChange={(e) => setTestTicket(e.target.value)} /><Button variant="secondary" disabled={!testTicket.trim()} onClick={() => void test()}>Test</Button></div>
            {testResult && <p className="text-[13px] text-muted" role="status">{testResult}</p>}
            <p className="text-xs text-muted">The test uses the saved version of the rule.</p>
          </div>
        )}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">{id ? "Save" : "Add automation"}</Button></div>
      </form>
    </Modal>
  );
}

function Runs({ automation, base, onClose }: { automation: Automation; base: string; onClose: () => void }) {
  const { data, error } = useLoad(() => api<{ runs: AutomationRun[] }>(`${base}/${automation.id}/runs`), [automation.id]);
  return (
    <Modal title={automation.name} eyebrow="Recent runs" onClose={onClose}>
      <ErrorNote message={error} />
      {data && !data.runs.length && <p className="text-muted">No runs in the last 30 days.</p>}
      <ul className="m-0 grid list-none gap-1 p-0">
        {data?.runs.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-sm last:border-0">
            <Badge tone={r.ok ? "success" : "danger"}>{r.ok ? "OK" : "Failed"}</Badge>
            <span className="font-mono text-xs text-muted">{r.ticketNumber ?? "—"}</span>
            <span className="text-muted">{formatDate(r.createdAt)} · {timeAgo(r.createdAt)}</span>
            {r.error && <span className="basis-full text-[13px] text-danger">{r.error}</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
