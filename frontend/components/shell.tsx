"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useTheme } from "../lib/theme";
import { useAuth } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { Button, IconButton, kbdClass, menuItemClass } from "./controls";
import { ChartIcon, CheckCircleIcon, DatabaseIcon, HomeIcon, KeyboardIcon, ListIcon, LogoutIcon, MenuIcon, MonitorIcon, MoonIcon, PlusIcon, PulseIcon, SearchIcon, ShieldIcon, SunIcon, TemplateIcon, TicketIcon, UserIcon, UsersIcon } from "./icons";
import { Logo } from "./logo";
import { Modal } from "./modal";
import { NotificationsBell } from "./notifications-bell";
import { Popover } from "./popover";
import { useLiveEvents, useLiveStatus } from "./realtime";
import { TicketForm } from "./ticket-form";
import { Avatar, Breadcrumbs } from "./ui";

type NavItem = { href: string; label: string; permission?: string; superAdminOnly?: boolean; icon?: React.ReactNode };
const ICONS: Record<string, React.ReactNode> = { "/": <HomeIcon />, "/tickets": <TicketIcon />, "/my-work": <CheckCircleIcon />, "/groups": <UsersIcon />, "/templates": <TemplateIcon />, "/reports": <ChartIcon />, "/activity": <PulseIcon />, "/people": <UserIcon />, "/audit": <ShieldIcon />, "/admin/data": <DatabaseIcon /> };
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
      <div className="min-h-screen p-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between py-3"><span className="inline-flex items-center gap-2 text-lg font-bold"><Logo size={26} />Campfire</span><Button variant="ghost" onClick={signOut}>Sign out</Button></div>
        <section className="mx-auto max-w-3xl">{children}</section>
      </div>
    );
  }

  const allowed = (item: NavItem) => (item.superAdminOnly ? user.role === "SUPERADMIN" : !item.permission || can(item.permission));
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter(allowed) })).filter((s) => s.items.length);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const tabCls = (on: boolean) => `grid justify-items-center gap-0.5 rounded-lg border-0 bg-transparent px-1 py-1.5 text-[11px] font-semibold ${on ? "text-ink" : "text-nav-text"}`;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-nav-line bg-nav px-3 pb-4 pt-5 md:flex">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2 text-xl font-bold tracking-tight text-ink"><Logo size={30} /><span>Campfire</span></Link>
        {can("tickets.create") && <Button className="mb-5 w-full justify-start" onClick={() => setCreating(true)}><PlusIcon size={16} />New ticket<kbd className="ml-auto rounded bg-black/20 px-1.5 font-mono text-[11px] font-normal text-on-accent">C</kbd></Button>}
        <nav aria-label="Main" className="grid gap-5">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-nav-label">{section.label}</div>
              <div className="grid gap-0.5">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${isActive(item.href) ? "bg-nav-active text-ink shadow-[inset_3px_0_0_var(--flame),var(--shadow-sm)]" : "text-nav-text hover:bg-nav-hover hover:text-ink"}`}>
                    <span className={isActive(item.href) ? "text-flame" : "text-nav-label"}>{ICONS[item.href]}</span>
                    <span>{item.label}</span>
                    {item.href === "/tickets" && openCount !== null && <span className="ml-auto rounded-full bg-soft px-2 text-xs font-semibold tabular-nums text-muted" aria-label={`${openCount} open`}>{openCount}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-nav-line px-2 pt-4">
          <Avatar name={user.name} size={34} />
          <div className="min-w-0 text-[13px] leading-tight"><strong className="block truncate">{user.name}</strong><span className="text-nav-label">{user.role === "SUPERADMIN" ? "SuperAdmin" : "Member"}</span></div>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        {!online && <div className="bg-danger-soft px-3 py-2 text-center text-[13px] text-danger" role="alert">You are offline. Changes will not save until you reconnect.</div>}
        {online && !live && <div className="border-b border-line bg-soft px-3 py-2 text-center text-[13px] text-muted" role="status">Live updates are paused. Reconnecting…</div>}
        <div className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-paper/90 px-4 backdrop-blur md:px-8">
          <Link href="/" className="mr-auto inline-flex items-center gap-2 font-bold md:hidden" aria-label="Campfire home"><Logo size={26} />Campfire</Link>
          <button type="button" className="ml-auto hidden h-9 w-80 items-center gap-2 whitespace-nowrap rounded-md border border-line-strong bg-card px-3 text-left text-sm font-normal text-muted transition hover:border-muted hover:bg-card hover:text-ink md:flex" onClick={() => setPalette(true)} aria-label="Search (Ctrl K)"><SearchIcon /><span className="truncate">Search tickets, groups, people</span><kbd className={`${kbdClass} ml-auto shrink-0`}>Ctrl K</kbd></button>
          <IconButton label="Open search" className="md:hidden" onClick={() => setPalette(true)}><SearchIcon size={18} /></IconButton>
          <NotificationsBell />
          <Popover label="Account menu" className="w-72" trigger={({ toggle, ...aria }) => <button type="button" className="rounded-full border-0 bg-transparent p-0.5 transition hover:ring-2 hover:ring-line-strong focus-visible:outline-2 focus-visible:outline-accent" onClick={toggle} aria-label="Account menu" {...aria}><Avatar name={user.name} size={32} /></button>}>
            {(close) => (
              <>
                <div className="mb-1 flex items-center gap-3 border-b border-line px-3 pb-3 pt-2"><Avatar name={user.name} size={38} /><div className="min-w-0"><strong className="block truncate">{user.name}</strong><small className="block truncate text-muted">{user.email}</small></div></div>
                <Link href="/account" className={menuItemClass} role="menuitem" onClick={close}><span className="inline-flex items-center gap-2.5"><UserIcon size={16} />Account &amp; API tokens</span></Link>
                <button type="button" className={menuItemClass} role="menuitem" onClick={() => { close(); setHelp(true); }}><span className="inline-flex items-center gap-2.5"><KeyboardIcon />Keyboard shortcuts</span><kbd className={kbdClass}>?</kbd></button>
                <div className="my-1.5 border-t border-line" />
                <div className="flex items-center justify-between gap-3 px-3 py-1.5" role="group" aria-label="Theme">
                  <span className="text-sm font-medium">Theme</span>
                  <span className="inline-flex rounded-lg border border-line-strong p-0.5">
                    {([["system", <MonitorIcon key="s" />], ["light", <SunIcon key="l" />], ["dark", <MoonIcon key="d" />]] as const).map(([t, icon]) => (
                      <button key={t} type="button" title={t[0].toUpperCase() + t.slice(1)} aria-label={`${t} theme`} className={`grid size-7 place-items-center rounded-md transition ${theme === t ? "bg-accent text-on-accent" : "text-muted hover:text-ink"}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>{icon}</button>
                    ))}
                  </span>
                </div>
                <div className="my-1.5 border-t border-line" />
                <button type="button" className={menuItemClass} role="menuitem" onClick={signOut}><span className="inline-flex items-center gap-2.5"><LogoutIcon />Sign out</span></button>
              </>
            )}
          </Popover>
        </div>
        <div className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">{children}</div>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-center border-t border-nav-line bg-nav px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 md:hidden" aria-label="Quick navigation">
        <Link href="/" className={tabCls(pathname === "/")}><HomeIcon />Home</Link>
        <Link href="/tickets" className={tabCls(pathname.startsWith("/tickets"))}><ListIcon />Tickets</Link>
        {can("tickets.create") ? <button type="button" className="-mt-5 grid size-12 place-items-center justify-self-center rounded-full border-0 bg-accent p-0 text-on-accent shadow-md" onClick={() => setCreating(true)} aria-label="Create ticket"><PlusIcon size={22} /></button> : <span />}
        <Link href="/groups" className={tabCls(pathname.startsWith("/groups"))}><UsersIcon />Groups</Link>
        <button type="button" className={tabCls(false)} onClick={() => setMore(true)}><MenuIcon />More</button>
      </nav>

      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="grid gap-1">
            {sections.flatMap((s) => s.items).map((item) => <Link key={item.href} href={item.href} className={menuItemClass} onClick={() => setMore(false)}><span className="inline-flex items-center gap-3 text-nav-label">{ICONS[item.href]}<span className="text-ink">{item.label}</span></span></Link>)}
            <Link href="/account" className={menuItemClass} onClick={() => setMore(false)}><span className="inline-flex items-center gap-3"><UserIcon />Account &amp; API tokens</span></Link>
            <Button variant="secondary" className="mt-3" onClick={signOut}>Sign out</Button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="Keyboard shortcuts" onClose={() => setHelp(false)}>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">{SHORTCUTS.map(([keys, what]) => <Fragment key={keys}><dt className="whitespace-nowrap"><kbd className={kbdClass}>{keys}</kbd></dt><dd className="text-muted">{what}</dd></Fragment>)}</dl>
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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs ? <div className="mb-1"><Breadcrumbs items={crumbs} /></div> : eyebrow ? <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-muted">{eyebrow}</span> : null}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
