"use client";
import { fieldClass } from "./controls";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { useDebounce } from "../lib/use-debounce";
import { useAuth } from "./auth-provider";
import { Modal } from "./modal";

type Item = { id: string; label: string; hint?: string; run: () => void };
type Results = { tickets: { id: string; ticketNumber: string; title: string }[]; groups: { id: string; name: string }[]; people: { id: string; name: string; email: string }[] };

const PAGES = [
  { label: "Overview", href: "/", permission: "tickets.view" }, { label: "Tickets", href: "/tickets", permission: "tickets.view" },
  { label: "My work", href: "/my-work", permission: "tickets.view" }, { label: "Groups", href: "/groups" },
  { label: "Templates", href: "/templates", permission: "tickets.create" }, { label: "Reports", href: "/reports", permission: "tickets.view" },
  { label: "People", href: "/people", permission: "users.view" }, { label: "Activity", href: "/activity", permission: "activity.view" },
  { label: "Audit log", href: "/audit", permission: "audit.view" }, { label: "Account & API tokens", href: "/account" },
];

/** Ctrl/⌘+K: jump to pages, create a ticket, or search tickets, groups and people. */
export function CommandPalette({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const { can, user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(query, 250);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!debounced.trim()) { setResults(null); return; }
    let cancelled = false;
    api<Results>(`/search?q=${encodeURIComponent(debounced.trim())}`).then((r) => !cancelled && setResults(r)).catch(() => undefined);
    return () => { cancelled = true; };
  }, [debounced]);

  const go = (href: string) => { onClose(); router.push(href); };
  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = PAGES.filter((p) => (!p.permission || can(p.permission)) && (!q || p.label.toLowerCase().includes(q))).map((p) => ({ id: p.href, label: p.label, hint: "Go to", run: () => go(p.href) }));
    const admin = user?.role === "SUPERADMIN" && (!q || "data management".includes(q)) ? [{ id: "/admin/data", label: "Data management", hint: "Go to", run: () => go("/admin/data") }] : [];
    const create = can("tickets.create") && (!q || "create ticket new".includes(q)) ? [{ id: "create", label: "Create ticket", hint: "Action", run: () => { onClose(); onCreate(); } }] : [];
    const found = results ? [
      ...results.tickets.map((t) => ({ id: `t${t.id}`, label: `${t.ticketNumber} · ${t.title}`, hint: "Ticket", run: () => go(`/tickets/${t.id}`) })),
      ...results.groups.map((g) => ({ id: `g${g.id}`, label: g.name, hint: "Group", run: () => go(`/groups/${g.id}`) })),
      ...results.people.map((p) => ({ id: `p${p.id}`, label: `${p.name} · ${p.email}`, hint: "Person", run: () => go("/people") })),
    ] : [];
    return [...create, ...found, ...pages, ...admin];
    // eslint-disable-next-line
  }, [query, results, can, user]);

  useEffect(() => setActive(0), [query, results]);

  return (
    <Modal title="Search" onClose={onClose}>
      <input ref={input} className={`${fieldClass} h-11 text-base`} autoFocus placeholder="Search tickets, groups, people, or jump to a page…" aria-label="Command search" value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
        }} />
      <ul className="mt-3 grid list-none gap-0.5 p-0" role="listbox">
        {items.slice(0, 12).map((item, index) => (
          <li key={item.id} role="option" aria-selected={index === active} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${index === active ? "bg-accent-soft shadow-[inset_3px_0_0_var(--flame)]" : ""}`} onMouseEnter={() => setActive(index)} onClick={item.run}>
            <span className="truncate font-medium">{item.label}</span><small className="shrink-0 rounded bg-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{item.hint}</small>
          </li>
        ))}
        {!items.length && <li className="px-3 py-6 text-center text-muted">No matches.</li>}
      </ul>
      <p className="mt-3 text-xs text-muted">↑ ↓ to move · Enter to open · Esc to close</p>
    </Modal>
  );
}
