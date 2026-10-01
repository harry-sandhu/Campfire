"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { NotificationsBell } from "./notifications-bell";
import { Avatar } from "./ui";

const NAV = [
  { href: "/", label: "Overview", permission: "tickets.view" },
  { href: "/tickets", label: "Tickets", permission: "tickets.view" },
  { href: "/my-work", label: "My work", permission: "tickets.view" },
  { href: "/groups", label: "Groups" },
  { href: "/people", label: "People", permission: "users.view" },
  { href: "/activity", label: "Activity", permission: "activity.view" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="app-shell">
      <aside>
        <Link href="/" className="brand"><span className="brand-mark"><i /></span><span>Campfire</span></Link>
        <nav aria-label="Main">
          {NAV.filter((item) => !item.permission || can(item.permission)).map((item) => {
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
          <NotificationsBell />
          <Link href="/account" className="ghost link-button">Account</Link>
          <button type="button" className="ghost" onClick={async () => { await logout(); router.replace("/login"); }}>Sign out</button>
        </div>
        {children}
      </section>
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
