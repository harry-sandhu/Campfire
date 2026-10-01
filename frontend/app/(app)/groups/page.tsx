"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { Avatar, Empty, ErrorNote, Spinner } from "../../../components/ui";
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
      <PageHeader title="Groups">{can("groups.create") && <button onClick={() => setCreating(true)}>+ Create group</button>}</PageHeader>
      <section className="panel">
        <div className="panel-head"><div><h2>Your groups</h2><p className="muted">Private workspaces with their own members, topics and tickets.</p></div></div>
        <ErrorNote message={error} />
        {loading && !data ? <Spinner /> : !data?.groups.length ? <Empty title="No groups yet" hint={can("groups.create") ? "Create a group to start organising work." : "Ask an administrator to add you to a group."} /> : (
          <div className="people-list">
            {data.groups.map((g) => (
              <Link key={g.id} href={`/groups/${g.id}`} className="person-row">
                <Avatar name={g.name} />
                <div><strong>{g.name}</strong><small>{g.description || `${g.memberIds.length} members`}</small></div>
                <span className="status">{g.memberIds.length} members</span>
              </Link>
            ))}
          </div>
        )}
      </section>
      {creating && (
        <Modal title="Create group" eyebrow="GROUPS" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={create}>
            <label>Name<input name="name" required maxLength={120} /></label>
            <label>Description<textarea name="description" rows={3} maxLength={1000} /></label>
            <ErrorNote message={formError} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button><button>Create group</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
