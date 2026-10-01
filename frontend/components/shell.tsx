"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { NotificationsBell } from "./notifications-bell";
import { TicketForm } from "./ticket-form";
import { Avatar } from "./ui";

const NAV = [
  { href: "/", label: "Overview", permission: "tickets.view" },
  { href: "/tickets", label: "Tickets", permission: "tickets.view" },
  { href: "/my-work", label: "My work", permission: "tickets.view" },
  { href: "/groups", label: "Groups" },
  { href: "/templates", label: "Templates", permission: "tickets.create" },
  { href: "/reports", label: "Reports", permission: "tickets.view" },
  { href: "/people", label: "People", permission: "users.view" },
  { href: "/activity", label: "Activity", permission: "activity.view" },
  { href: "/audit", label: "Audit log", permission: "audit.view" },
  { href: "/admin/data", label: "Data", superAdminOnly: true },
];

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
};

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((open) => !open); return; }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector("[role=dialog]")) return;
      if (event.key === "/") { event.preventDefault(); setPalette(true); }
      else if (event.key === "c" && can("tickets.create")) { event.preventDefault(); setCreating(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [can]);

  if (!user) return null;
  const items = NAV.filter((item) => (item.superAdminOnly ? user.role === "SUPERADMIN" : !item.permission || can(item.permission)));

  return (
    <div className="app-shell">
      <aside>
        <Link href="/" className="brand"><span className="brand-mark"><i /></span><span>Campfire</span></Link>
        <nav aria-label="Main">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </nav>
        <div className="profile">
          <Avatar name={user.name} />
          <div><strong>{user.name}</strong><small>{user.role === "SUPERADMIN" ? "SuperAdmin" : "Member"}</small></div>
        </div>
      </aside>
      <section className="workspace">
        <div className="topbar">
          <button type="button" className="ghost palette-trigger" onClick={() => setPalette(true)} aria-label="Open command palette">Search <kbd>Ctrl K</kbd></button>
          <NotificationsBell />
          <Link href="/account" className="ghost link-button">Account</Link>
          <button type="button" className="ghost" onClick={async () => { await logout(); router.replace("/login"); }}>Sign out</button>
        </div>
        {children}
      </section>
      {palette && <CommandPalette onClose={() => setPalette(false)} onCreate={() => setCreating(true)} />}
      {creating && <TicketForm onClose={() => setCreating(false)} />}
    </div>
  );
}

export function PageHeader({ eyebrow = "YOUR WORKSPACE", title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      <div className="header-actions">{children}</div>
    </header>
  );
}
