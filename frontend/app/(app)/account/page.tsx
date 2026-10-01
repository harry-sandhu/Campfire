"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { ConfirmDialog, Modal } from "../../../components/modal";
import { PageHeader } from "../../../components/shell";
import { useToast } from "../../../components/toast";
import { ErrorNote, Skeleton } from "../../../components/ui";
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

      {!forced && <>
        <section className="panel spaced">
          <div className="panel-head"><div><h2>Signed-in devices</h2><p className="muted">Sessions that can currently refresh. Revoke any you do not recognise.</p></div>
            {(sessions.data?.sessions.length ?? 0) > 1 && <button type="button" className="ghost" onClick={() => void api("/auth/sessions/revoke-others", { method: "POST" }).then(() => { toast("Other devices signed out"); sessions.reload(); })}>Sign out other devices</button>}</div>
          {sessions.loading && !sessions.data ? <Skeleton rows={5} /> : <div className="people-list">
            {sessions.data?.sessions.map((s) => (
              <div className="person-row" key={s.id}>
                <div><strong>{deviceName(s.userAgent)}{s.current && <span className="chip">This device</span>}</strong><small>{s.ip || "unknown IP"} · active {timeAgo(s.lastActive)}</small></div>
                {!s.current && <button type="button" className="ghost danger-text" onClick={() => void api(`/auth/sessions/${s.id}`, { method: "DELETE" }).then(() => { toast("Session revoked"); sessions.reload(); })}>Revoke</button>}
              </div>
            ))}
          </div>}
        </section>

        <section className="panel spaced">
          <div className="panel-head"><div><h2>API tokens</h2><p className="muted">Personal tokens act as you, with your permissions and group access. Use them in scripts or integrations. <a className="link-button" href={`${apiOrigin}/api/docs`} target="_blank" rel="noopener noreferrer">API reference ↗</a></p></div><button type="button" onClick={() => { setTokenError(""); setCreating(true); }}>New token</button></div>
          <div className="people-list">
            {tokens.data?.tokens.map((t) => (
              <div className="person-row" key={t.id}>
                <div><strong>{t.name}</strong><small>{t.prefix}… · {t.readOnly ? "Read-only" : "Read & write"} · {t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : "never used"}{t.expiresAt ? ` · expires ${formatDate(t.expiresAt)}` : ""}</small></div>
                <button type="button" className="ghost danger-text" onClick={() => setRevoking(t)}>Revoke</button>
              </div>
            ))}
            {!tokens.data?.tokens.length && <p className="muted pad">No tokens yet.</p>}
          </div>
        </section>
      </>}

      {creating && (
        <Modal title="New API token" eyebrow="API" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={createToken}>
            <label>Name<input name="name" required maxLength={60} placeholder="Reporting script" /></label>
            <label>Access<select name="access" defaultValue="read"><option value="read">Read-only (recommended)</option><option value="write">Read &amp; write</option></select></label>
            <label>Expires<select name="expires" defaultValue="90"><option value="30">In 30 days</option><option value="90">In 90 days</option><option value="365">In a year</option><option value="">Never</option></select></label>
            <ErrorNote message={tokenError} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => setCreating(false)}>Cancel</button><button>Create token</button></div>
          </form>
        </Modal>
      )}
      {created && (
        <Modal title="Copy your token now" eyebrow="SHOWN ONCE" onClose={() => setCreated(null)}>
          <div className="stack">
            <p className="muted">This is the only time the token is shown. Store it somewhere safe; anyone with it can act as you.</p>
            <input readOnly value={created} aria-label="API token" onFocus={(e) => e.currentTarget.select()} />
            <div className="modal-actions"><button type="button" className="ghost" onClick={() => void navigator.clipboard?.writeText(created).then(() => toast("Copied"))}>Copy</button><button type="button" onClick={() => setCreated(null)}>Done</button></div>
          </div>
        </Modal>
      )}
      {revoking && <ConfirmDialog title="Revoke token" message={`Anything using "${revoking.name}" will stop working immediately.`} confirmLabel="Revoke" onClose={() => setRevoking(null)} onConfirm={() => api(`/api-tokens/${revoking.id}`, { method: "DELETE" }).then(() => { toast("Token revoked"); tokens.reload(); })} />}
    </>
  );
}
