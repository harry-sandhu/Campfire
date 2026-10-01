"use client";
import { FormEvent, useState } from "react";
import { api, json } from "../lib/api";
import { formatDate, timeAgo } from "../lib/format";
import { useLoad } from "../lib/use-load";
import type { Milestone, Webhook } from "../lib/types";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { Badge, Button, Field, fieldClass, rowClass } from "./controls";
import { ErrorNote, Panel } from "./ui";

export function MilestonesSection({ groupId, manager }: { groupId: string; manager: boolean }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`), [groupId]);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      await api(`/groups/${groupId}/milestones`, { method: "POST", body: json({ name: f.get("name"), description: f.get("description") || "", dueDate: f.get("dueDate") || null }) });
      toast("Milestone created");
      setCreating(false);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <Panel title="Milestones" description="Group tickets toward a goal and track progress." action={manager && <Button onClick={() => { setError(""); setCreating(true); }}>New milestone</Button>}>
      {data?.milestones.map((m) => (
        <div className={rowClass} key={m.id}>
          <div className="min-w-48 flex-1">
            <strong className="flex items-center gap-2">{m.name}{m.closedAt && <Badge>Closed</Badge>}</strong>
            <small className="text-muted">{m.dueDate ? `Due ${formatDate(m.dueDate)} · ` : ""}{m.done}/{m.total} tickets done</small>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuenow={m.done} aria-valuemin={0} aria-valuemax={m.total}><span className="block h-full rounded-full bg-pine" style={{ width: m.total ? `${(m.done / m.total) * 100}%` : "0%" }} /></div>
          </div>
          {manager && <Button variant="ghost" size="sm" onClick={() => void api(`/groups/${groupId}/milestones/${m.id}`, { method: "PATCH", body: json({ closed: !m.closedAt }) }).then(reload)}>{m.closedAt ? "Reopen" : "Close"}</Button>}
          {manager && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(m)}>Delete</Button>}
        </div>
      ))}
      {!data?.milestones.length && <p className="p-5 text-muted">No milestones yet.</p>}
      {creating && (
        <Modal title="New milestone" eyebrow="Milestones" onClose={() => setCreating(false)}>
          <form className="grid gap-5" onSubmit={create}>
            <Field label="Name"><input className={fieldClass} name="name" required maxLength={120} placeholder="Launch v1" /></Field>
            <Field label="Description"><textarea className={fieldClass} name="description" rows={3} maxLength={1000} /></Field>
            <Field label="Due date"><input className={fieldClass} name="dueDate" type="date" /></Field>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create</Button></div>
          </form>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete milestone" message={`Delete "${removing.name}"? Its tickets stay but lose the milestone.`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/groups/${groupId}/milestones/${removing.id}`, { method: "DELETE" }).then(() => { toast("Milestone deleted"); reload(); })} />}
    </Panel>
  );
}

export function WebhooksSection({ groupId }: { groupId: string }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api<{ webhooks: Webhook[]; events: string[] }>(`/groups/${groupId}/webhooks`), [groupId]);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Webhook | null>(null);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      const hook = await api<Webhook & { secret: string }>(`/groups/${groupId}/webhooks`, { method: "POST", body: json({ url: f.get("url"), format: f.get("format"), events: f.getAll("events") }) });
      setSecret(hook.secret);
      setCreating(false);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function test(hook: Webhook) {
    try { const r = await api<{ status: number; delivered: boolean }>(`/groups/${groupId}/webhooks/${hook.id}/test`, { method: "POST" }); toast(r.delivered ? "Test delivered" : `Test failed (${r.status || "no response"})`, r.delivered ? "success" : "error"); reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <Panel title="Webhooks" description="Send ticket events to other tools. Slack incoming webhooks work directly. Only https URLs on the public internet are allowed." action={<Button onClick={() => { setError(""); setCreating(true); }}>Add webhook</Button>}>
      {data?.webhooks.map((h) => (
        <div className={rowClass} key={h.id}>
          <div className="min-w-48 flex-1"><strong>{new URL(h.url).host}</strong><small className="block text-muted">{h.format === "slack" ? "Slack" : "JSON"} · {h.events.join(", ")} · {h.lastDeliveredAt ? `last ${h.lastStatus} ${timeAgo(h.lastDeliveredAt)}` : "never delivered"}</small></div>
          <Badge tone={h.active ? "success" : "neutral"}>{h.active ? "Active" : "Paused"}</Badge>
          <Button variant="ghost" size="sm" onClick={() => void test(h)}>Test</Button>
          <Button variant="ghost" size="sm" onClick={() => void api(`/groups/${groupId}/webhooks/${h.id}`, { method: "PATCH", body: json({ active: !h.active }) }).then(reload)}>{h.active ? "Pause" : "Resume"}</Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(h)}>Delete</Button>
        </div>
      ))}
      {!data?.webhooks.length && <p className="p-5 text-muted">No webhooks yet.</p>}
      {creating && (
        <Modal title="Add webhook" eyebrow="Integrations" onClose={() => setCreating(false)}>
          <form className="grid gap-5" onSubmit={create}>
            <Field label="URL"><input className={fieldClass} name="url" type="url" required placeholder="https://hooks.slack.com/services/…" /></Field>
            <Field label="Format"><select className={fieldClass} name="format" defaultValue="json"><option value="json">JSON (signed)</option><option value="slack">Slack message</option></select></Field>
            <fieldset className="rounded-lg border border-line px-4 pb-3 pt-1"><legend className="px-1.5 text-[13px] font-semibold text-muted">Events</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{(data?.events ?? []).map((e) => <label key={e} className="flex items-center gap-2 text-sm"><input className="size-4 accent-[var(--accent)]" type="checkbox" name="events" value={e} defaultChecked />{e}</label>)}</div></fieldset>
            <ErrorNote message={error} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Add webhook</Button></div>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal title="Signing secret" eyebrow="Shown once" onClose={() => setSecret(null)}>
          <div className="grid gap-4">
            <p className="text-muted">Deliveries carry an <code className="rounded bg-soft px-1.5 font-mono text-[13px]">X-Campfire-Signature: sha256=…</code> header: an HMAC-SHA256 of the request body with this secret. Save it now; it is not shown again.</p>
            <input className={`${fieldClass} font-mono`} readOnly value={secret} aria-label="Signing secret" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex justify-end"><Button onClick={() => setSecret(null)}>Done</Button></div>
          </div>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete webhook" message={`Stop sending events to ${new URL(removing.url).host}?`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/groups/${groupId}/webhooks/${removing.id}`, { method: "DELETE" }).then(() => { toast("Webhook deleted"); reload(); })} />}
    </Panel>
  );
}
