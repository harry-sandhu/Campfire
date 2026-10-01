"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTheme } from "../lib/theme";
import { useAuth } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { HomeIcon, ListIcon, MenuIcon, PlusIcon, SearchIcon, UsersIcon } from "./icons";
import { Logo } from "./logo";
import { Modal } from "./modal";
import { NotificationsBell } from "./notifications-bell";
import { Popover } from "./popover";
import { useLiveEvents, useLiveStatus } from "./realtime";
import { TicketForm } from "./ticket-form";
import { Avatar, Breadcrumbs } from "./ui";

type NavItem = { href: string; label: string; permission?: string; superAdminOnly?: boolean };
const SECTIONS: { label: string; items: NavItem[] }[] = [
  { label: "Work", items: [{ href: "/", label: "Overview", permission: "tickets.view" }, { href: "/tickets", label: "Tickets", permission: "tickets.view" }, { href: "/my-work", label: "My work", permission: "tickets.view" }] },
  { label: "Teams", items: [{ href: "/groups", label: "Groups" }, { href: "/templates", label: "Templates", permission: "tickets.create" }] },
  { label: "Insight", items: [{ href: "/reports", label: "Reports", permission: "tickets.view" }, { href: "/activity", label: "Activity", permission: "activity.view" }] },
  { label: "Admin", items: [{ href: "/people", label: "People", permission: "users.view" }, { href: "/audit", label: "Audit log", permission: "audit.view" }, { href: "/admin/data", label: "Data", superAdminOnly: true }] },
];

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

const SHORTCUTS: [string, string][] = [["Ctrl / ⌘ + K", "Search and jump anywhere"], ["/", "Open search"], ["C", "Create a ticket"], ["?", "Show this list"], ["Esc", "Close a dialog or menu"]];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const live = useLiveStatus();
  const { theme, setTheme } = useTheme();
  const [palette, setPalette] = useState(false);
  const [creating, setCreating] = useState(false);
  const [more, setMore] = useState(false);
  const [help, setHelp] = useState(false);
  const [online, setOnline] = useState(true);
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const mustChange = !!user?.mustChangePassword;
  const loadCount = () => { if (can("tickets.view") && !mustChange) api<{ counts: Record<string, number> }>("/dashboard").then((d) => setOpenCount(d.counts.open + d.counts.inProgress + d.counts.inReview + d.counts.blocked)).catch(() => undefined); };
  // eslint-disable-next-line
  useEffect(loadCount, [user?.id, mustChange]);
  useLiveEvents((event) => { if (event.type.startsWith("ticket.")) loadCount(); }, 1500);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector("[role=dialog]")) return;
      if (event.key === "/") { event.preventDefault(); setPalette(true); }
      else if (event.key === "?") { event.preventDefault(); setHelp(true); }
      else if (event.key === "c" && can("tickets.create")) { event.preventDefault(); setCreating(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [can]);

  if (!user) return null;
  const signOut = async () => { await logout(); router.replace("/login"); };

  if (mustChange) {
    return (
      <div className="forced-shell">
        <div className="topbar"><span className="brand" style={{ color: "var(--ink)", padding: 0 }}><Logo size={24} />Campfire</span><div className="topbar-actions"><button type="button" className="ghost" onClick={signOut}>Sign out</button></div></div>
        <section className="workspace">{children}</section>
      </div>
    );
  }

  const allowed = (item: NavItem) => (item.superAdminOnly ? user.role === "SUPERADMIN" : !item.permission || can(item.permission));
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter(allowed) })).filter((s) => s.items.length);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="app-shell">
      <aside>
        <Link href="/" className="brand"><Logo size={26} /><span>Campfire</span></Link>
        <nav aria-label="Main">
          {sections.map((section) => (
            <div className="nav-section" key={section.label}>
              <div className="nav-label">{section.label}</div>
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className={`nav-item${isActive(item.href) ? " active" : ""}`} aria-current={isActive(item.href) ? "page" : undefined}>
                  <span>{item.label}</span>
                  {item.href === "/tickets" && openCount !== null && <span className="nav-count" aria-label={`${openCount} open`}>{openCount}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">{user.role === "SUPERADMIN" ? "SuperAdmin" : "Member"} · {user.name}</div>
      </aside>

      <section className="workspace">
        {!online && <div className="net-banner offline" role="alert">You are offline. Changes will not save until you reconnect.</div>}
        {online && !live && <div className="net-banner" role="status">Live updates are paused. Reconnecting…</div>}
        <div className="topbar">
          <Link href="/" className="mobile-brand" aria-label="Campfire home"><Logo size={22} /></Link>
          <div className="topbar-actions">
            <button type="button" className="search-trigger" onClick={() => setPalette(true)} aria-label="Search (Ctrl K)"><SearchIcon /><span>Search</span><kbd>Ctrl K</kbd></button>
            <NotificationsBell />
            <Popover label="Account menu" trigger={({ toggle, ...aria }) => <button type="button" className="avatar-button" onClick={toggle} aria-label="Account menu" {...aria}><Avatar name={user.name} size={30} /></button>}>
              {(close) => (
                <>
                  <div className="menu-head"><strong>{user.name}</strong><small>{user.email}</small></div>
                  <Link href="/account" className="menu-item" role="menuitem" onClick={close}>Account &amp; API tokens</Link>
                  <button type="button" className="menu-item" role="menuitem" onClick={() => { close(); setHelp(true); }}>Keyboard shortcuts <kbd>?</kbd></button>
                  <hr className="menu-sep" />
                  <div className="menu-item" role="group" aria-label="Theme">
                    <span>Theme</span>
                    <span className="segmented">{(["system", "light", "dark"] as const).map((t) => <button key={t} type="button" className={theme === t ? "on" : ""} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}</span>
                  </div>
                  <hr className="menu-sep" />
                  <button type="button" className="menu-item" role="menuitem" onClick={signOut}>Sign out</button>
                </>
              )}
            </Popover>
          </div>
        </div>
        {children}
      </section>

      <nav className="bottom-nav" aria-label="Quick navigation">
        <Link href="/" className={isActive("/") && pathname === "/" ? "active" : ""}><HomeIcon />Home</Link>
        <Link href="/tickets" className={pathname.startsWith("/tickets") ? "active" : ""}><ListIcon />Tickets</Link>
        {can("tickets.create") ? <button type="button" className="fab" onClick={() => setCreating(true)} aria-label="Create ticket"><PlusIcon size={22} /></button> : <span />}
        <Link href="/groups" className={pathname.startsWith("/groups") ? "active" : ""}><UsersIcon />Groups</Link>
        <button type="button" onClick={() => setMore(true)}><MenuIcon />More</button>
      </nav>

      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="stack">
            {sections.flatMap((s) => s.items).map((item) => <Link key={item.href} href={item.href} className="menu-item" onClick={() => setMore(false)}>{item.label}</Link>)}
            <Link href="/account" className="menu-item" onClick={() => setMore(false)}>Account &amp; API tokens</Link>
            <button type="button" className="secondary" onClick={signOut}>Sign out</button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <dl className="shortcuts">{SHORTCUTS.map(([keys, what]) => <><dt key={keys}><kbd>{keys}</kbd></dt><dd key={what}>{what}</dd></>)}</dl>
        </Modal>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} onCreate={() => setCreating(true)} />}
      {creating && <TicketForm onClose={() => setCreating(false)} />}
    </div>
  );
}

export function PageHeader({ eyebrow, title, crumbs, children }: { eyebrow?: string; title: string; crumbs?: { label: string; href?: string }[]; children?: React.ReactNode }) {
  useEffect(() => { document.title = `${title} · Campfire`; }, [title]);
  return (
    <header className="page-header">
      <div>
        {crumbs ? <Breadcrumbs items={crumbs} /> : eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
      </div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
