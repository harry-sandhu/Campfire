"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../components/auth-provider";
import { Logo } from "../../components/logo";
import { ErrorNote } from "../../components/ui";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Sign in · Campfire"; }, []);
  useEffect(() => { if (!loading && user) router.replace("/"); }, [loading, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><Logo size={30} /><span>Campfire</span></div>
        <h1>Sign in</h1>
        <p className="muted">Pick up where the team left off.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input name="email" type="email" required autoComplete="username" placeholder="you@company.com" autoFocus /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <ErrorNote message={error} />
          <button disabled={busy || (loading && !!user)}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="muted note" style={{ padding: "18px 0 0" }}>Trouble signing in? Ask your administrator to reset your password.</p>
      </section>
    </main>
  );
}
