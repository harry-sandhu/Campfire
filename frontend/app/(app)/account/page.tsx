"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { Badge, Button, Field, fieldClass, rowClass } from "../../../components/controls";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { ErrorNote, Panel, Skeleton } from "../../../components/ui";
import { api, apiOrigin, json, setAccessToken } from "../../../lib/api";
import { formatDate, timeAgo } from "../../../lib/format";
import { useLoad } from "../../../lib/use-load";
import type { ApiTokenInfo, Session } from "../../../lib/types";

const deviceName = (ua: string) => {
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|node|axios/i.test(ua) ? "Script" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
};

export default function AccountPage() {
  const { user, reloadUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState("");
  const forced = !!user?.mustChangePassword;
  const sessions = useLoad(() => (forced ? Promise.resolve(null) : api<{ sessions: Session[] }>("/auth/sessions")), [forced]);
  const tokens = useLoad(() => (forced ? Promise.resolve(null) : api<{ tokens: ApiTokenInfo[] }>("/api-tokens")), [forced]);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiTokenInfo | null>(null);
  const [tokenError, setTokenError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    if (f.get("newPassword") !== f.get("confirm")) return setError("The new passwords do not match.");
    try {
      const data = await api<{ accessToken?: string }>("/auth/change-password", { method: "POST", body: json({ currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") }) });
      if (data?.accessToken) setAccessToken(data.accessToken);
      await reloadUser();
      toast("Password changed. Other devices were signed out.");
      form.reset();
      setError("");
      if (forced) router.replace("/");
      else sessions.reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function createToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      const t = await api<ApiTokenInfo & { token: string }>("/api-tokens", { method: "POST", body: json({ name: f.get("name"), readOnly: f.get("access") === "read", expiresInDays: f.get("expires") ? Number(f.get("expires")) : undefined }) });
      setCreated(t.token);
      setCreating(false);
      tokens.reload();
    } catch (e) { setTokenError((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={forced ? "Action required" : "Account"} title={forced ? "Choose a new password" : "Your account"} />
      <Panel title="Password" description={`${user?.name} · ${user?.email}`}>
        <div className="p-5">
          {forced && <p className="mb-5 rounded-lg bg-warn-soft px-4 py-3 text-sm">Your password was set by an administrator. Choose your own before continuing.</p>}
          <form className="grid max-w-md gap-5" onSubmit={submit}>
            <Field label="Current password"><input className={fieldClass} name="currentPassword" type="password" required autoComplete="current-password" /></Field>
            <Field label="New password"><input className={fieldClass} name="newPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password" /></Field>
            <Field label="Confirm new password"><input className={fieldClass} name="confirm" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <ErrorNote message={error} />
            <div><Button type="submit">Change password</Button></div>
          </form>
        </div>
      </Panel>

      {!forced && <div className="mt-6 grid gap-6">
        <Panel title="Signed-in devices" description="Sessions that can currently refresh. Revoke any you do not recognise."
          action={(sessions.data?.sessions.length ?? 0) > 1 && <Button variant="secondary" size="sm" onClick={() => void api("/auth/sessions/revoke-others", { method: "POST" }).then(() => { toast("Other devices signed out"); sessions.reload(); })}>Sign out other devices</Button>}>
          {sessions.loading && !sessions.data ? <Skeleton rows={3} className="rounded-none border-0" /> : sessions.data?.sessions.map((s) => (
            <div className={rowClass} key={s.id}>
              <div className="min-w-48 flex-1"><strong className="flex items-center gap-2">{deviceName(s.userAgent)}{s.current && <Badge tone="success">This device</Badge>}</strong><small className="text-muted">{s.ip || "unknown IP"} · active {timeAgo(s.lastActive)}</small></div>
              {!s.current && <Button variant="ghost" size="sm" className="text-danger" onClick={() => void api(`/auth/sessions/${s.id}`, { method: "DELETE" }).then(() => { toast("Session revoked"); sessions.reload(); })}>Revoke</Button>}
            </div>
          ))}
        </Panel>

        <Panel title="API tokens" description="Personal tokens act as you, with your permissions and group access. Use them in scripts or integrations." action={<div className="flex items-center gap-3"><a className="text-[13px] font-semibold text-accent hover:underline" href={`${apiOrigin}/api/docs`} target="_blank" rel="noopener noreferrer">API reference ↗</a><Button onClick={() => { setTokenError(""); setCreating(true); }}>New token</Button></div>}>
          {tokens.data?.tokens.map((t) => (
            <div className={rowClass} key={t.id}>
              <div className="min-w-48 flex-1"><strong className="block">{t.name}</strong><small className="text-muted"><span className="font-mono">{t.prefix}…</span> · {t.readOnly ? "Read-only" : "Read & write"} · {t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : "never used"}{t.expiresAt ? ` · expires ${formatDate(t.expiresAt)}` : ""}</small></div>
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoking(t)}>Revoke</Button>
            </div>
          ))}
          {!tokens.data?.tokens.length && <p className="p-5 text-muted">No tokens yet.</p>}
        </Panel>
      </div>}

      {creating && (
        <Modal title="New API token" eyebrow="API" onClose={() => setCreating(false)}>
          <form className="grid gap-5" onSubmit={createToken}>
            <Field label="Name"><input className={fieldClass} name="name" required maxLength={60} placeholder="Reporting script" /></Field>
            <Field label="Access"><select className={fieldClass} name="access" defaultValue="read"><option value="read">Read-only (recommended)</option><option value="write">Read &amp; write</option></select></Field>
            <Field label="Expires"><select className={fieldClass} name="expires" defaultValue="90"><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In a year</option><option value="">Never</option></select></Field>
            <ErrorNote message={tokenError} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit">Create token</Button></div>
          </form>
        </Modal>
      )}
      {created && (
        <Modal title="Copy your token now" eyebrow="Shown once" onClose={() => setCreated(null)}>
          <div className="grid gap-4">
            <p className="text-muted">This is the only time the token is shown. Store it somewhere safe; anyone with it can act as you.</p>
            <input className={`${fieldClass} font-mono`} readOnly value={created} aria-label="API token" onFocus={(e) => e.currentTarget.select()} />
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => void navigator.clipboard?.writeText(created).then(() => toast("Copied"))}>Copy</Button><Button onClick={() => setCreated(null)}>Done</Button></div>
          </div>
        </Modal>
      )}
      {revoking && <ConfirmDialog title="Revoke token" message={`Anything using "${revoking.name}" will stop working immediately.`} confirmLabel="Revoke" onClose={() => setRevoking(null)} onConfirm={() => api(`/api-tokens/${revoking.id}`, { method: "DELETE" }).then(() => { toast("Token revoked"); tokens.reload(); })} />}
    </div>
  );
}
