"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../components/auth-provider";
import { ErrorNote, Spinner } from "../../components/ui";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await login(String(form.get("email")), String(form.get("password")));
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><i /></span><span>Campfire</span></div>
        <span className="eyebrow">INTERNAL OPERATIONS</span>
        <h1>Welcome to Campfire</h1>
        <p className="muted">A focused workspace for moving important work forward.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input name="email" type="email" required autoComplete="username" placeholder="you@company.com" /></label>
          <label>Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <ErrorNote message={error} />
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
