"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { Button, Field, fieldClass, panelClass } from "../../../components/controls";
import { PlusIcon } from "../../../components/icons";
import { Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Avatar, Empty, ErrorNote, Skeleton } from "../../../components/ui";
import { api, json } from "../../../lib/api";
import { useLoad } from "../../../lib/use-load";
import type { Group } from "../../../lib/types";

export default function GroupsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useLoad(() => api<{ groups: Group[] }>("/groups"), []);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      await api("/groups", { method: "POST", body: json({ name: f.get("name"), description: f.get("description") || "" }) });
      toast("Group created");
      setCreating(false);
      reload();
    } catch (e) { setFormError((e as Error).message); }
  }

  return (
    <>
      <PageHeader title="Groups" eyebrow="Teams">{can("groups.create") && <Button onClick={() => setCreating(true)}><PlusIcon size={16} />Create group</Button>}</PageHeader>
      <p className="-mt-2 mb-6 max-w-2xl text-muted">Private workspaces with their own members, topics and tickets.</p>
      <ErrorNote message={error} />
      {loading && !data ? <Skeleton rows={4} /> : !data?.groups.length ? <div className={panelClass}><Empty title="No groups yet" hint={can("groups.create") ? "Create a group to start organising work." : "Ask an administrator to add you to a group."} /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className={`${panelClass} group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md`}>
              <div className="flex items-center gap-3">
                <Avatar name={g.name} size={40} />
                <div className="min-w-0"><strong className="block truncate text-base group-hover:text-accent">{g.name}</strong><span className="text-[13px] text-muted">{g.memberIds.length} {g.memberIds.length === 1 ? "member" : "members"}</span></div>
              </div>
              <p className="line-clamp-2 min-h-10 text-sm text-muted">{g.description || "No description yet."}</p>
            </Link>
          ))}
        </div>
      )}
      {creating && (
        <Modal title="Create group" eyebrow="Groups" onClose={() => setCreating(false)}>
          <form className="grid gap-5" onSubmit={create}>
            <Field label="Name"><input className={fieldClass} name="name" required maxLength={120} /></Field>
            <Field label="Description"><textarea className={fieldClass} name="description" rows={3} maxLength={1000} /></Field>
            <ErrorNote message={formError} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create group</Button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
