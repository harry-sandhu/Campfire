"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Empty, ErrorNote, PriorityPill, Skeleton } from "../../../components/ui";
import { api, json } from "../../../lib/api";
import { formatDate, label } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import { PRIORITIES, type Group, type Template } from "../../../lib/types";

export default function TemplatesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<{ templates: Template[] }>("/templates"), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Template | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => { api<{ groups: Group[] }>("/groups").then((d) => setGroups(d.groups)).catch(() => undefined); }, []);
  const groupName = (id: string | null) => (id ? groups.find((g) => g.id === id)?.name ?? "Group" : "Personal");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      await api("/templates", { method: "POST", body: json({ name: f.get("name"), title: f.get("title"), description: f.get("description") || "", priority: f.get("priority"), groupId: f.get("groupId") || null, recurrence: f.get("every") ? { every: f.get("every") } : null }) });
      toast("Template saved");
      setCreating(false);
      reload();
    } catch (e) { setFormError((e as Error).message); }
  }

  const useTemplate = (t: Template) => api<{ id: string }>(`/templates/${t.id}/create`, { method: "POST" }).then((r) => { toast("Ticket created"); router.push(`/tickets/${r.id}`); }).catch((e) => toast(e.message, "error"));

  return (
    <>
      <PageHeader title="Templates"><button onClick={() => { setFormError(""); setCreating(true); }}>New template</button></PageHeader>
      <section className="panel">
        <div className="panel-head"><div><h2>Ticket templates</h2><p className="muted">Reusable tickets. Recurring templates create a new ticket on a schedule (checked every few minutes while the server is awake).</p></div></div>
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} /> : !data?.templates.length ? <Empty title="No templates yet" hint="Save a ticket you create often, or set one to repeat weekly." /> : (
          <div className="people-list">
            {data.templates.map((t) => (
              <div className="person-row" key={t.id}>
                <div><strong>{t.name}</strong><small>{groupName(t.groupId)} · {t.title}</small></div>
                <PriorityPill priority={t.priority} />
                {t.recurrence && <span className="status">{t.recurrence.active ? `Repeats ${t.recurrence.every}, next ${formatDate(t.recurrence.nextRunAt)}` : "Paused"}</span>}
                <div className="person-actions">
                  <button type="button" onClick={() => void useTemplate(t)}>Create ticket</button>
                  {t.recurrence && <button type="button" className="ghost" onClick={() => void api(`/templates/${t.id}`, { method: "PATCH", body: json({ active: !t.recurrence!.active }) }).then(reload).catch((e) => toast(e.message, "error"))}>{t.recurrence.active ? "Pause" : "Resume"}</button>}
                  {(t.createdById === user!.id || user!.role === "SUPERADMIN" || t.groupId) && <button type="button" className="ghost danger-text" onClick={() => setRemoving(t)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {creating && (
        <Modal title="New template" eyebrow="TEMPLATES" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={create}>
            <label>Template name<input name="name" required maxLength={80} placeholder="Weekly server check" /></label>
            <label>Ticket title<input name="title" required maxLength={200} /></label>
            <label>Description<textarea name="description" rows={4} placeholder="Markdown supported" /></label>
            <div className="form-row">
              <label>Group<select name="groupId" defaultValue=""><option value="">Personal</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
              <label>Priority<select name="priority" defaultValue="MEDIUM">{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></label>
              <label>Repeat<select name="every" defaultValue=""><option value="">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            </div>
            <ErrorNote message={formError} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button><button>Save template</button></div>
          </form>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete template" message={`Delete "${removing.name}"? Tickets already created from it stay.`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/templates/${removing.id}`, { method: "DELETE" }).then(() => { toast("Template deleted"); reload(); }).catch((e) => toast(e.message, "error"))} />}
    </>
  );
}
