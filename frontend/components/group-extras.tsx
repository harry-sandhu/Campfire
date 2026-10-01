"use client";
import { FormEvent, useState } from "react";
import { api, json } from "../lib/api";
import { formatDate, timeAgo } from "../lib/format";
import { useLoad } from "../lib/use-load";
import type { Milestone, Webhook } from "../lib/types";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { ErrorNote } from "./ui";

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
    <section className="panel spaced">
      <div className="panel-head"><div><h2>Milestones</h2><p className="muted">Group tickets toward a goal and track progress.</p></div>{manager && <button type="button" onClick={() => { setError(""); setCreating(true); }}>+ Milestone</button>}</div>
      <div className="people-list">
        {data?.milestones.map((m) => (
          <div className="person-row" key={m.id}>
            <div>
              <strong>{m.name}{m.closedAt && <span className="chip">Closed</span>}</strong>
              <small>{m.dueDate ? `Due ${formatDate(m.dueDate)} · ` : ""}{m.done}/{m.total} tickets done</small>
              <div className="progress" role="progressbar" aria-valuenow={m.done} aria-valuemin={0} aria-valuemax={m.total}><span style={{ width: m.total ? `${(m.done / m.total) * 100}%` : "0%" }} /></div>
            </div>
            {manager && <button type="button" className="ghost" onClick={() => void api(`/groups/${groupId}/milestones/${m.id}`, { method: "PATCH", body: json({ closed: !m.closedAt }) }).then(reload)}>{m.closedAt ? "Reopen" : "Close"}</button>}
            {manager && <button type="button" className="ghost danger-text" onClick={() => setRemoving(m)}>Delete</button>}
          </div>
        ))}
        {!data?.milestones.length && <p className="muted pad">No milestones yet.</p>}
      </div>
      {creating && (
        <Modal title="New milestone" eyebrow="MILESTONES" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={create}>
            <label>Name<input name="name" required maxLength={120} placeholder="Launch v1" /></label>
            <label>Description<textarea name="description" rows={3} maxLength={1000} /></label>
            <label>Due date<input name="dueDate" type="date" /></label>
            <ErrorNote message={error} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button><button>Create</button></div>
          </form>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete milestone" message={`Delete "${removing.name}"? Its tickets stay but lose the milestone.`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/groups/${groupId}/milestones/${removing.id}`, { method: "DELETE" }).then(() => { toast("Milestone deleted"); reload(); })} />}
    </section>
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
    <section className="panel spaced">
      <div className="panel-head"><div><h2>Webhooks</h2><p className="muted">Send ticket events to other tools. Slack incoming webhooks work directly. Only https URLs on the public internet are allowed.</p></div><button type="button" onClick={() => { setError(""); setCreating(true); }}>+ Webhook</button></div>
      <div className="people-list">
        {data?.webhooks.map((h) => (
          <div className="person-row" key={h.id}>
            <div><strong>{new URL(h.url).host}</strong><small>{h.format === "slack" ? "Slack" : "JSON"} · {h.events.join(", ")} · {h.lastDeliveredAt ? `last ${h.lastStatus} ${timeAgo(h.lastDeliveredAt)}` : "never delivered"}</small></div>
            <span className="status">{h.active ? "Active" : "Paused"}</span>
            <button type="button" className="ghost" onClick={() => void test(h)}>Test</button>
            <button type="button" className="ghost" onClick={() => void api(`/groups/${groupId}/webhooks/${h.id}`, { method: "PATCH", body: json({ active: !h.active }) }).then(reload)}>{h.active ? "Pause" : "Resume"}</button>
            <button type="button" className="ghost danger-text" onClick={() => setRemoving(h)}>Delete</button>
          </div>
        ))}
        {!data?.webhooks.length && <p className="muted pad">No webhooks yet.</p>}
      </div>
      {creating && (
        <Modal title="Add webhook" eyebrow="INTEGRATIONS" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={create}>
            <label>URL<input name="url" type="url" required placeholder="https://hooks.slack.com/services/…" /></label>
            <label>Format<select name="format" defaultValue="json"><option value="json">JSON (signed)</option><option value="slack">Slack message</option></select></label>
            <fieldset><legend>Events</legend><div className="check-grid">{(data?.events ?? []).map((e) => <label key={e} className="check"><input type="checkbox" name="events" value={e} defaultChecked />{e}</label>)}</div></fieldset>
            <ErrorNote message={error} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button><button>Add webhook</button></div>
          </form>
        </Modal>
      )}
      {secret && (
        <Modal title="Signing secret" eyebrow="SHOWN ONCE" onClose={() => setSecret(null)}>
          <div className="stack">
            <p className="muted">Deliveries carry an <code>X-Campfire-Signature: sha256=…</code> header: an HMAC-SHA256 of the request body with this secret. Save it now; it is not shown again.</p>
            <input readOnly value={secret} aria-label="Signing secret" onFocus={(e) => e.currentTarget.select()} />
            <div className="modal-actions"><button type="button" onClick={() => setSecret(null)}>Done</button></div>
          </div>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete webhook" message={`Stop sending events to ${new URL(removing.url).host}?`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/groups/${groupId}/webhooks/${removing.id}`, { method: "DELETE" }).then(() => { toast("Webhook deleted"); reload(); })} />}
    </section>
  );
}
