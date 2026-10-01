"use client";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { Badge, Button, Field, fieldClass, rowClass } from "../../../components/controls";
import { PlusIcon } from "../../../components/icons";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Avatar, Empty, ErrorNote, Panel, Skeleton } from "../../../components/ui";
import { api, json } from "../../../lib/api";
import { useLoad } from "../../../lib/use-load";
import type { User } from "../../../lib/types";

type RoleTemplate = { id: string; name: string; description: string; permissions: string[] };

type Dialog = { kind: "create" } | { kind: "permissions" | "reset" | "delete"; person: User } | null;

export default function PeoplePage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<{ users: User[]; permissions: string[] }>("/users"), []);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [formError, setFormError] = useState("");
  const close = () => { setDialog(null); setFormError(""); };

  const submit = (action: (f: FormData) => Promise<unknown>, message: string) => async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try { await action(new FormData(event.currentTarget)); toast(message); close(); reload(); } catch (e) { setFormError((e as Error).message); }
  };

  return (
    <>
      <PageHeader title="People" eyebrow="Admin">{can("users.create") && <Button onClick={() => setDialog({ kind: "create" })}><PlusIcon size={16} />Create user</Button>}</PageHeader>
      <Panel title="Workspace members" description="Create users and manage workspace access.">
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} className="rounded-none border-0" /> : !data?.users.length ? <Empty title="No users" /> : data.users.map((person) => (
          <div className={rowClass} key={person.id}>
            <Avatar name={person.name} size={36} />
            <div className="min-w-44 flex-1"><strong className="block">{person.name}</strong><small className="text-muted">{person.email}</small></div>
            <Badge tone={person.isActive === false ? "danger" : person.role === "SUPERADMIN" ? "accent" : "success"}>{person.isActive === false ? "Disabled" : person.role === "SUPERADMIN" ? "SuperAdmin" : "Active"}</Badge>
            {person.role === "USER" && (
              <div className="flex flex-wrap items-center gap-1">
                {can("users.edit") && person.id !== user!.id && <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "permissions", person })}>Permissions</Button>}
                {can("users.disable") && person.id !== user!.id && <Button variant="ghost" size="sm" onClick={() => void api(`/users/${person.id}/status`, { method: "PATCH", body: json({ isActive: person.isActive === false }) }).then(() => { toast(person.isActive === false ? "User enabled" : "User disabled"); reload(); }).catch((e) => toast(e.message, "error"))}>{person.isActive === false ? "Enable" : "Disable"}</Button>}
                {can("users.edit") && <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "reset", person })}>Reset password</Button>}
                {can("users.edit") && person.id !== user!.id && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDialog({ kind: "delete", person })}>Delete</Button>}
              </div>
            )}
          </div>
        ))}
      </Panel>

      {dialog?.kind === "create" && (
        <Modal title="Create user" eyebrow="Access" onClose={close}>
          <form className="grid gap-5" onSubmit={submit((f) => api("/users", { method: "POST", body: json({ name: f.get("name"), email: f.get("email"), temporaryPassword: f.get("temporaryPassword") }) }), "User created")}>
            <Field label="Name"><input className={fieldClass} name="name" required /></Field>
            <Field label="Email"><input className={fieldClass} name="email" type="email" required /></Field>
            <Field label="Temporary password"><input className={fieldClass} name="temporaryPassword" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <p className="text-[13px] text-muted">They must change this password at first sign in.</p>
            <ErrorNote message={formError} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit">Create user</Button></div>
          </form>
        </Modal>
      )}
      {dialog?.kind === "permissions" && data && <PermissionsDialog person={dialog.person} catalog={data.permissions} onClose={close} onSaved={() => { toast("Permissions saved"); close(); reload(); }} />}
      {dialog?.kind === "reset" && (
        <Modal title={`Reset password for ${dialog.person.name}`} eyebrow="Access" onClose={close}>
          <form className="grid gap-5" onSubmit={submit((f) => api(`/users/${dialog.person.id}/reset-password`, { method: "POST", body: json({ temporaryPassword: f.get("temporaryPassword") }) }), "Password reset")}>
            <Field label="New temporary password"><input className={fieldClass} name="temporaryPassword" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <ErrorNote message={formError} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit">Reset password</Button></div>
          </form>
        </Modal>
      )}
      {dialog?.kind === "delete" && <ConfirmDialog title="Delete user" message={`Delete ${dialog.person.name}? Their sessions are revoked and they are removed from all groups.`} confirmLabel="Delete user" onClose={close} onConfirm={() => api(`/users/${dialog.person.id}`, { method: "DELETE" }).then(() => { toast("User deleted"); reload(); }).catch((e) => toast(e.message, "error"))} />}
    </>
  );
}

function PermissionsDialog({ person, catalog, onClose, onSaved }: { person: User; catalog: string[]; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>(person.permissions);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [error, setError] = useState("");
  const holds = (p: string) => user!.role === "SUPERADMIN" || user!.permissions.includes(p);

  useEffect(() => { api<{ templates: RoleTemplate[] }>("/users/role-templates").then((d) => setTemplates(d.templates)).catch(() => undefined); }, []);

  // Applying a template replaces only the permissions the actor may change; the rest stay as they were.
  const apply = (t: RoleTemplate) => setSelected((current) => [...current.filter((p) => !holds(p)), ...t.permissions.filter(holds)]);

  return (
    <Modal title={`${person.name}'s permissions`} eyebrow="Access" wide onClose={onClose}>
      <form className="grid gap-5" onSubmit={async (e) => { e.preventDefault(); try { await api(`/users/${person.id}`, { method: "PATCH", body: json({ permissions: selected }) }); onSaved(); } catch (err) { setError((err as Error).message); } }}>
        {templates.length > 0 && (
          <fieldset className="rounded-lg border border-line px-4 pb-4 pt-1"><legend className="px-1.5 text-[13px] font-semibold text-muted">Start from a role</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{templates.map((t) => <button key={t.id} type="button" className="grid gap-0.5 rounded-lg border border-line bg-soft p-3 text-left transition hover:border-line-strong hover:bg-hover" onClick={() => apply(t)}><strong className="text-sm">{t.name}</strong><small className="text-muted">{t.description}</small></button>)}</div>
          </fieldset>
        )}
        <p className="text-[13px] text-muted">You can only change permissions you hold yourself.</p>
        <div className="grid max-h-[44vh] gap-x-4 gap-y-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
          {catalog.map((p) => <label key={p} className="flex items-center gap-2 text-sm"><input className="size-4 accent-[var(--accent)]" type="checkbox" checked={selected.includes(p)} disabled={!holds(p)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />{p}</label>)}
        </div>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Save permissions</Button></div>
      </form>
    </Modal>
  );
}
