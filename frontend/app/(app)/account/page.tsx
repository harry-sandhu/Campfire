"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { ErrorNote } from "../../../components/ui";
import { api, json, setAccessToken } from "../../../lib/api";

export default function AccountPage() {
  const { user, reloadUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const forced = !!user?.mustChangePassword;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) return setError("The new passwords do not match.");
    try {
      const data = await api<{ accessToken?: string }>("/auth/change-password", { method: "POST", body: json({ currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") }) });
      if (data?.accessToken) setAccessToken(data.accessToken);
      await reloadUser();
      toast("Password changed");
      form.reset();
      setError("");
      if (forced) router.replace("/");
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <PageHeader eyebrow={forced ? "ACTION REQUIRED" : "ACCOUNT"} title={forced ? "Choose a new password" : "Your account"} />
      <section className="panel pad narrow">
        <p className="muted">{user?.name} · {user?.email}</p>
        {forced && <p className="notice">Your password was set by an administrator. Choose your own before continuing.</p>}
        <form className="stack" onSubmit={submit}>
          <label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
          <label>New password<input name="newPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password" /></label>
          <label>Confirm new password<input name="confirm" type="password" minLength={8} required autoComplete="new-password" /></label>
          <ErrorNote message={error} />
          <button>Change password</button>
        </form>
      </section>
    </>
  );
}
