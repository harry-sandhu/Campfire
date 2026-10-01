"use client";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Avatar, Empty, ErrorNote, Skeleton } from "../../../components/ui";
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
      <PageHeader title="People">{can("users.create") && <button onClick={() => setDialog({ kind: "create" })}>Create user</button>}</PageHeader>
      <section className="panel">
        <div className="panel-head"><div><h2>People</h2><p className="muted">Create users and manage workspace access.</p></div></div>
        <ErrorNote message={error} />
        {loading && !data ? <Skeleton rows={5} /> : !data?.users.length ? <Empty title="No users" /> : (
          <div className="people-list">
            {data.users.map((person) => (
              <div className="person-row" key={person.id}>
                <Avatar name={person.name} />
                <div><strong>{person.name}</strong><small>{person.email}</small></div>
                <span className="status">{person.isActive === false ? "Disabled" : person.role === "SUPERADMIN" ? "SuperAdmin" : "Active"}</span>
                {person.role === "USER" && (
                  <div className="person-actions">
                    {can("users.edit") && person.id !== user!.id && <button type="button" className="ghost" onClick={() => setDialog({ kind: "permissions", person })}>Permissions</button>}
                    {can("users.disable") && person.id !== user!.id && <button type="button" className="ghost" onClick={() => void api(`/users/${person.id}/status`, { method: "PATCH", body: json({ isActive: person.isActive === false }) }).then(() => { toast(person.isActive === false ? "User enabled" : "User disabled"); reload(); }).catch((e) => toast(e.message, "error"))}>{person.isActive === false ? "Enable" : "Disable"}</button>}
                    {can("users.edit") && <button type="button" className="ghost" onClick={() => setDialog({ kind: "reset", person })}>Reset password</button>}
                    {can("users.edit") && person.id !== user!.id && <button type="button" className="ghost danger-text" onClick={() => setDialog({ kind: "delete", person })}>Delete</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog?.kind === "create" && (
        <Modal title="Create user" eyebrow="ACCESS" onClose={close}>
          <form className="stack" onSubmit={submit((f) => api("/users", { method: "POST", body: json({ name: f.get("name"), email: f.get("email"), temporaryPassword: f.get("temporaryPassword") }) }), "User created")}>
            <label>Name<input name="name" required /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Temporary password<input name="temporaryPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
            <p className="muted note">They must change this password at first sign in.</p>
            <ErrorNote message={formError} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={close}>Cancel</button><button>Create user</button></div>
          </form>
        </Modal>
      )}
      {dialog?.kind === "permissions" && data && <PermissionsDialog person={dialog.person} catalog={data.permissions} onClose={close} onSaved={() => { toast("Permissions saved"); close(); reload(); }} />}
      {dialog?.kind === "reset" && (
        <Modal title={`Reset password for ${dialog.person.name}`} eyebrow="ACCESS" onClose={close}>
          <form className="stack" onSubmit={submit((f) => api(`/users/${dialog.person.id}/reset-password`, { method: "POST", body: json({ temporaryPassword: f.get("temporaryPassword") }) }), "Password reset")}>
            <label>New temporary password<input name="temporaryPassword" type="password" minLength={8} required autoComplete="new-password" /></label>
            <ErrorNote message={formError} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={close}>Cancel</button><button>Reset password</button></div>
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
    <Modal title={`${person.name}'s permissions`} eyebrow="ACCESS" wide onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); try { await api(`/users/${person.id}`, { method: "PATCH", body: json({ permissions: selected }) }); onSaved(); } catch (err) { setError((err as Error).message); } }}>
        {templates.length > 0 && (
          <fieldset><legend>Start from a role</legend>
            <div className="role-grid">{templates.map((t) => <button key={t.id} type="button" className="role-card" onClick={() => apply(t)}><strong>{t.name}</strong><small>{t.description}</small></button>)}</div>
          </fieldset>
        )}
        <p className="muted note">You can only change permissions you hold yourself.</p>
        <div className="permission-list">
          {catalog.map((p) => <label key={p} className="check"><input type="checkbox" checked={selected.includes(p)} disabled={!holds(p)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />{p}</label>)}
        </div>
        <ErrorNote message={error} />
        <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button>Save permissions</button></div>
      </form>
    </Modal>
  );
}
