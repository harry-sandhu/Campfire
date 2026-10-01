"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { Badge, Button, Field, fieldClass, rowClass } from "../../../components/controls";
import { PlusIcon } from "../../../components/icons";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Empty, ErrorNote, Panel, PriorityPill, Skeleton } from "../../../components/ui";
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
      <PageHeader title="Templates" eyebrow="Teams"><Button onClick={() => { setFormError(""); setCreating(true); }}><PlusIcon size={16} />New template</Button></PageHeader>
      <Panel title="Ticket templates" description="Reusable tickets. Recurring templates create a new ticket on a schedule (checked every few minutes while the server is awake).">
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} className="rounded-none border-0" /> : !data?.templates.length ? <Empty title="No templates yet" hint="Save a ticket you create often, or set one to repeat weekly." /> : data.templates.map((t) => (
          <div className={rowClass} key={t.id}>
            <div className="min-w-48 flex-1"><strong className="block">{t.name}</strong><small className="text-muted">{groupName(t.groupId)} · {t.title}</small></div>
            <PriorityPill priority={t.priority} />
            {t.recurrence && <Badge tone={t.recurrence.active ? "accent" : "neutral"}>{t.recurrence.active ? `Repeats ${t.recurrence.every}, next ${formatDate(t.recurrence.nextRunAt)}` : "Paused"}</Badge>}
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" onClick={() => void useTemplate(t)}>Create ticket</Button>
              {t.recurrence && <Button variant="ghost" size="sm" onClick={() => void api(`/templates/${t.id}`, { method: "PATCH", body: json({ active: !t.recurrence!.active }) }).then(reload).catch((e) => toast(e.message, "error"))}>{t.recurrence.active ? "Pause" : "Resume"}</Button>}
              {(t.createdById === user!.id || user!.role === "SUPERADMIN" || t.groupId) && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(t)}>Delete</Button>}
            </div>
          </div>
        ))}
      </Panel>
      {creating && (
        <Modal title="New template" eyebrow="Templates" onClose={() => setCreating(false)}>
          <form className="grid gap-5" onSubmit={create}>
            <Field label="Template name"><input className={fieldClass} name="name" required maxLength={80} placeholder="Weekly server check" /></Field>
            <Field label="Ticket title"><input className={fieldClass} name="title" required maxLength={200} /></Field>
            <Field label="Description"><textarea className={fieldClass} name="description" rows={4} placeholder="Markdown supported" /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Group"><select className={fieldClass} name="groupId" defaultValue=""><option value="">Personal</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
              <Field label="Priority"><select className={fieldClass} name="priority" defaultValue="MEDIUM">{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
              <Field label="Repeat"><select className={fieldClass} name="every" defaultValue=""><option value="">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
            </div>
            <ErrorNote message={formError} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Save template</Button></div>
          </form>
        </Modal>
      )}
      {removing && <ConfirmDialog title="Delete template" message={`Delete "${removing.name}"? Tickets already created from it stay.`} confirmLabel="Delete" onClose={() => setRemoving(null)} onConfirm={() => api(`/templates/${removing.id}`, { method: "DELETE" }).then(() => { toast("Template deleted"); reload(); }).catch((e) => toast(e.message, "error"))} />}
    </>
  );
}
