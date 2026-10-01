"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../components/auth-provider";
import { Button, fieldClass } from "../../components/controls";
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
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-coal p-12 text-[#f3ebdd] lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -bottom-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#e0612a66_0%,#e8a43a22_45%,transparent_70%)]" aria-hidden="true" />
        <div className="relative flex items-center gap-3 text-2xl font-bold"><Logo size={38} />Campfire</div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">Gather round the work.</h2>
          <p className="mt-4 text-lg text-[#cdbfa8]">Tickets, groups and conversations in one warm, calm place, so your team always knows what needs attention next.</p>
        </div>
        <p className="relative text-sm text-[#a99b85]">Easy on the eyes, day or night.</p>
      </aside>
      <section className="grid place-items-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm animate-[rise_0.3s_ease-out]">
          <div className="mb-8 flex items-center gap-2.5 text-2xl font-bold lg:hidden"><Logo size={32} />Campfire</div>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-muted">Pick up where the team left off.</p>
          <form onSubmit={submit} className="mt-8 grid gap-5">
            <label className="grid gap-1.5 text-sm font-semibold">Email<input className={fieldClass} name="email" type="email" required autoComplete="username" placeholder="you@company.com" autoFocus /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Password<input className={fieldClass} name="password" type="password" required autoComplete="current-password" /></label>
            <ErrorNote message={error} />
            <Button type="submit" size="lg" disabled={busy || (loading && !!user)}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
          <p className="mt-6 text-[13px] text-muted">Trouble signing in? Ask your administrator to reset your password.</p>
        </div>
      </section>
    </main>
  );
}
