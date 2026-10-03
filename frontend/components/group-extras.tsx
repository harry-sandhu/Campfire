"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api, json } from "../lib/api";
import { formatDate, timeAgo } from "../lib/format";
import { useLoad } from "../lib/use-load";
import { STATUSES, type Milestone, type Ticket, type TicketPage, type Webhook, type WebhookDelivery } from "../lib/types";
import { label } from "../lib/format";
import { ConfirmDialog, Modal } from "./modal";
import { useToast } from "./toast";
import { Badge, Button, Field, fieldClass, rowClass } from "./controls";
import { ErrorNote, Panel } from "./ui";


/** Overdue: past due and still open. Due soon: due within three days. */
function milestoneState(m: Milestone) {
  if (m.closedAt || !m.dueDate) return "";
  const left = new Date(m.dueDate).getTime() - Date.now();
  return left < 0 ? "overdue" : left <= 3 * 86400000 ? "soon" : "";
}

/** The tickets of one milestone, grouped by status. */
function MilestoneTickets({ groupId, milestoneId }: { groupId: string; milestoneId: string }) {
  const { data, error, loading } = useLoad(() => api<TicketPage>(`/tickets?groupId=${groupId}&milestoneId=${milestoneId}&limit=50`), [groupId, milestoneId]);
  if (loading && !data) return <p className="px-5 pb-4 text-[13px] text-muted">Loading tickets…</p>;
  if (error) return <div className="px-5 pb-4"><ErrorNote message={error} /></div>;
  if (!data?.tickets.length) return <p className="px-5 pb-4 text-[13px] text-muted">No tickets in this milestone yet. Add some from the Tickets page with “Add to milestone”.</p>;
  return (
    <div className="grid gap-3 bg-soft/40 px-5 pb-4 pt-3">
      {STATUSES.map((st) => {
        const items = data.tickets.filter((t: Ticket) => t.status === st);
        if (!items.length) return null;
        return (
          <div key={st}>
            <h4 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted">{label(st)} · {items.length}</h4>
            <ul className="m-0 grid list-none gap-0.5 p-0">{items.map((t: Ticket) => <li key={t.id} className="text-sm"><Link className="text-ink hover:underline" href={`/tickets/${t.id}`}><span className="mr-2 font-mono text-xs text-muted">{t.ticketNumber}</span>{t.title}</Link></li>)}</ul>
          </div>
        );
      })}
      {data.total > data.tickets.length && <p className="text-xs text-muted">Showing {data.tickets.length} of {data.total} tickets.</p>}
    </div>
  );
}

export function MilestonesSection({ groupId, manager }: { groupId: string; manager: boolean }) {
  const toast = useToast();
  const { data, reload } = useLoad(() => api<{ milestones: Milestone[] }>(`/groups/${groupId}/milestones`), [groupId]);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Milestone | null>(null);
  const [open, setOpen] = useState<string | null>(null);
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
      {data?.milestones.map((m) => {
        const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
        const state = milestoneState(m);
        return (
          <div className="border-b border-line last:border-0" key={m.id}>
            <div className={`${rowClass} border-0`}>
              <button type="button" className="min-w-48 flex-1 border-0 bg-transparent p-0 text-left" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                <strong className="flex flex-wrap items-center gap-2">{m.name}{m.closedAt && <Badge>Closed</Badge>}{state === "overdue" && <Badge tone="danger">Overdue</Badge>}{state === "soon" && <Badge tone="accent">Due soon</Badge>}</strong>
                <small className="text-muted">{m.dueDate ? `Due ${formatDate(m.dueDate)} · ` : ""}{m.done}/{m.total} tickets done · {pct}%</small>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-label={`${m.name} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span className="block h-full rounded-full bg-pine" style={{ width: `${pct}%` }} /></div>
              </button>
              {manager && <Button variant="ghost" size="sm" onClick={() => void api(`/groups/${groupId}/milestones/${m.id}`, { method: "PATCH", body: json({ closed: !m.closedAt }) }).then(reload)}>{m.closedAt ? "Reopen" : "Close"}</Button>}
              {manager && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(m)}>Delete</Button>}
            </div>
            {open === m.id && <MilestoneTickets groupId={groupId} milestoneId={m.id} />}
          </div>
        );
      })}
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
  const [guide, setGuide] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Webhook | null>(null);
  const [history, setHistory] = useState<Webhook | null>(null);
  const [error, setError] = useState("");
  const base = `/groups/${groupId}/webhooks`;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      const hook = await api<Webhook & { secret: string }>(base, { method: "POST", body: json({ url: f.get("url"), format: f.get("format"), events: f.getAll("events") }) });
      setSecret(hook.secret);
      setCreating(false);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function test(hook: Webhook) {
    try { const r = await api<{ status: number; delivered: boolean }>(`${base}/${hook.id}/test`, { method: "POST" }); toast(r.delivered ? "Test delivered" : `Test failed (${r.status || "no response"})`, r.delivered ? "success" : "error"); reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function rotate(hook: Webhook) {
    try { const r = await api<Webhook & { secret: string }>(`${base}/${hook.id}/rotate-secret`, { method: "POST" }); setSecret(r.secret); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <Panel title="Webhooks" description="Send ticket events to other tools. Slack incoming webhooks work directly. Only https URLs on the public internet are allowed." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => setGuide(true)}>Connect Slack</Button><Button onClick={() => { setError(""); setCreating(true); }}>Add webhook</Button></div>}>
      {data?.webhooks.map((h) => (
        <div className={rowClass} key={h.id}>
          <div className="min-w-48 flex-1"><strong>{new URL(h.url).host}</strong><small className="block text-muted">{h.format === "slack" ? "Slack" : "JSON"} · {h.events.join(", ")} · {h.lastDeliveredAt ? `last ${h.lastStatus} ${timeAgo(h.lastDeliveredAt)}` : "never delivered"}</small>{!h.active && h.failures >= 10 && <small className="block text-danger">Paused automatically after repeated failures. Check the history, then resume.</small>}</div>
          {h.active && h.failures > 0 && <Badge tone="danger">{h.failures} failing</Badge>}
          <Badge tone={h.active ? "success" : "neutral"}>{h.active ? "Active" : "Paused"}</Badge>
          <select className="h-8 rounded-md border border-line-strong bg-card px-2 text-[13px]" aria-label={`Format for ${new URL(h.url).host}`} value={h.format} onChange={(e) => void api(`${base}/${h.id}`, { method: "PATCH", body: json({ format: e.target.value }) }).then(reload).catch((err: Error) => toast(err.message, "error"))}><option value="json">JSON</option><option value="slack">Slack</option></select>
          <Button variant="ghost" size="sm" onClick={() => setHistory(h)}>History</Button>
          <Button variant="ghost" size="sm" onClick={() => void test(h)}>Test</Button>
          <Button variant="ghost" size="sm" onClick={() => void rotate(h)}>New secret</Button>
          <Button variant="ghost" size="sm" onClick={() => void api(`${base}/${h.id}`, { method: "PATCH", body: json({ active: !h.active }) }).then(reload)}>{h.active ? "Pause" : "Resume"}</Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(h)}>Delete</Button>
        </div>
      ))}
      {!data?.webhooks.length && <p className="p-5 text-muted">No webhooks yet.</p>}
      {guide && (
        <Modal title="Connect Slack" eyebrow="Integrations" onClose={() => setGuide(false)}>
          <ol className="m-0 grid list-decimal gap-2.5 pl-5 text-sm">
            <li>In Slack, open <strong>api.slack.com/apps</strong> and create an app (from scratch) in your workspace.</li>
            <li>Turn on <strong>Incoming Webhooks</strong>, then choose <strong>Add New Webhook to Workspace</strong> and pick the channel.</li>
            <li>Copy the webhook URL. It starts with <code className="rounded bg-soft px-1 font-mono text-[13px]">https://hooks.slack.com/services/</code>.</li>
            <li>Close this window, choose <strong>Add webhook</strong>, paste the URL and set the format to <strong>Slack message</strong>.</li>
            <li>Press <strong>Test</strong> on the new webhook. A test message should appear in the channel within a few seconds.</li>
          </ol>
          <p className="mt-3 text-[13px] text-muted">Slack messages are also what the “Post to Slack” automation action uses.</p>
          <div className="mt-4 flex justify-end"><Button onClick={() => { setGuide(false); setError(""); setCreating(true); }}>Add webhook</Button></div>
        </Modal>
      )}
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
      {history && <DeliveryHistory groupId={groupId} hook={history} onClose={() => { setHistory(null); reload(); }} />}
      {removing && <ConfirmDialog title="Delete webhook" message={`Stop sending events to ${new URL(removing.url).host}?`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`${base}/${removing.id}`, { method: "DELETE" }).then(() => { toast("Webhook deleted"); reload(); })} />}
    </Panel>
  );
}

function DeliveryHistory({ groupId, hook, onClose }: { groupId: string; hook: Webhook; onClose: () => void }) {
  const toast = useToast();
  const path = `/groups/${groupId}/webhooks/${hook.id}/deliveries`;
  const { data, error, reload } = useLoad(() => api<{ deliveries: WebhookDelivery[] }>(path), [hook.id]);
  async function resend(d: WebhookDelivery) {
    try { const r = await api<{ delivered: boolean; status: number }>(`${path}/${d.id}/resend`, { method: "POST" }); toast(r.delivered ? "Delivered" : `Failed again (${r.status || "no response"})`, r.delivered ? "success" : "error"); reload(); }
    catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <Modal title={new URL(hook.url).host} eyebrow="Delivery history" onClose={onClose}>
      <ErrorNote message={error} />
      {data && !data.deliveries.length && <p className="text-muted">No deliveries in the last 30 days.</p>}
      <ul className="m-0 grid list-none gap-1 p-0">
        {data?.deliveries.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-sm last:border-0">
            <Badge tone={d.ok ? "success" : "danger"}>{d.ok ? d.status : d.status || "No response"}</Badge>
            <span className="font-mono text-xs">{d.event}</span>
            <span className="text-muted">{timeAgo(d.createdAt)} · {d.durationMs} ms</span>
            {!d.ok && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void resend(d)}>Resend</Button>}
            {d.error && <span className="basis-full text-[13px] text-danger">{d.error}</span>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
