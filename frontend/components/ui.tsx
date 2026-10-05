import Link from "next/link";
import { assigneesOf, formatDate, isOverdue, label } from "../lib/format";
import type { Ref, Ticket } from "../lib/types";
import { CommentIcon, FlameIcon } from "./icons";

export const Spinner = ({ full = false }: { full?: boolean }) => (
  <div className={`grid place-items-center ${full ? "min-h-screen bg-paper" : "py-14"}`}>
    <div className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" role="status" aria-label="Loading" />
  </div>
);
export const ErrorNote = ({ message }: { message: string }) => (message ? <p className="my-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{message}</p> : null);

/** Placeholder lines shown while a page loads, so the layout does not jump. */
export function Skeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-line bg-card ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
          <span className="h-3 w-14 animate-pulse rounded bg-soft" />
          <span className="h-3 animate-pulse rounded bg-soft" style={{ width: `${48 + ((i * 17) % 38)}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-accent-soft text-accent"><FlameIcon size={22} /></span>
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = { OPEN: "var(--s-open)", IN_PROGRESS: "var(--s-progress)", IN_REVIEW: "var(--s-review)", WAITING: "var(--s-waiting)", BLOCKED: "var(--s-blocked)", COMPLETED: "var(--s-done)", CLOSED: "var(--s-closed)" };
export const statusColor = (status: string) => STATUS_COLOR[status] ?? "var(--s-open)";

/** Coloured dot with plain text: readable without colour, and quieter than a filled pill. */
export const StatusPill = ({ status }: { status: string }) => (
  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]"><i className="size-2 shrink-0 rounded-full" style={{ background: statusColor(status) }} aria-hidden="true" />{label(status)}</span>
);

const LEVEL: Record<string, number> = { NO_PRIORITY: 0, LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const PRIORITY_COLOR: Record<string, string> = { NO_PRIORITY: "var(--muted)", LOW: "var(--muted)", MEDIUM: "var(--muted)", HIGH: "var(--p-high)", URGENT: "var(--p-urgent)" };

/** Four ascending bars; the number lit shows the level. The text label stays for screen readers and wider rows. */
export function PriorityPill({ priority, showLabel = true }: { priority: string; showLabel?: boolean }) {
  const level = LEVEL[priority] ?? 0;
  return (
    <span className="inline-flex items-end gap-2 text-[13px]" style={{ color: PRIORITY_COLOR[priority] }} title={label(priority)}>
      <span className="inline-flex h-4 items-end gap-0.5" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={`w-[3px] rounded-[1px] bg-current ${n <= level ? "" : "opacity-25"}`} style={{ height: 3 + n * 3 }} />)}</span>
      <span className={showLabel ? "" : "sr-only"}>{label(priority)}</span>
    </span>
  );
}

const STAT_TONE: Record<string, string> = { neutral: "var(--s-open)", progress: "var(--s-progress)", review: "var(--s-review)", blocked: "var(--s-blocked)", done: "var(--s-done)", overdue: "var(--s-blocked)" };

export function Stat({ label: text, value, alert, tone = "neutral", href }: { label: string; value: number | string; alert?: boolean; tone?: keyof typeof STAT_TONE; href?: string }) {
  const hot = alert && Number(value) > 0;
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px] font-medium text-muted"><i className="size-2 rounded-full" style={{ background: STAT_TONE[tone] }} aria-hidden="true" />{text}</span>
      <strong className={`mt-1 block text-3xl font-semibold tabular-nums leading-none ${hot ? "text-danger" : ""}`}>{value}</strong>
    </>
  );
  const cls = "block rounded-lg border border-line bg-card p-4 shadow-sm transition";
  return href ? <Link href={href} className={`${cls} hover:border-line-strong hover:shadow-md`}>{body}</Link> : <div className={cls}>{body}</div>;
}

// Muted, earthy tones from around a fire: each person gets a stable colour, all readable with light text.
const TONES = ["#a4502a", "#6c7f4f", "#4b6f8f", "#8b5a7b", "#9a7126", "#58707a", "#8f4a3c", "#5f7a6d"];
const toneFor = (name: string) => TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length];

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return <span className="inline-grid shrink-0 place-items-center rounded-full font-semibold leading-none text-[#fffaf3]" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: toneFor(name) }}>{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

export function AvatarStack({ people, max = 3 }: { people: Pick<Ref, "name">[]; max?: number }) {
  if (!people.length) return <span className="text-muted">—</span>;
  const shown = people.slice(0, max);
  return (
    <span className="inline-flex items-center [&>*+*]:-ml-1.5 [&>*]:ring-2 [&>*]:ring-card" title={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => <Avatar key={i} name={p.name} size={24} />)}
      {people.length > max && <span className="inline-grid size-6 place-items-center rounded-full bg-soft text-[10px] font-semibold text-muted" aria-hidden="true">+{people.length - max}</span>}
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center text-[13px] text-muted" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center">
          {item.href ? <Link href={item.href} className="rounded hover:text-ink hover:underline">{item.label}</Link> : <span aria-current="page" className="text-ink">{item.label}</span>}
          {i < items.length - 1 && <span className="px-2 text-line-strong" aria-hidden="true">/</span>}
        </span>
      ))}
    </nav>
  );
}

export const Tag = ({ children }: { children: React.ReactNode }) => <span className="rounded border border-line-strong px-1.5 text-[11px] leading-4 text-muted">{children}</span>;

const EDGE: Record<string, string> = { URGENT: "shadow-[inset_3px_0_0_var(--p-urgent)]", HIGH: "shadow-[inset_3px_0_0_var(--p-high)]" };

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const people = assigneesOf(ticket);
  const overdue = isOverdue(ticket);
  const due = ticket.dueDate ? formatDate(ticket.dueDate).replace(/, \d{4}$/, "") : "";
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-hover md:grid-cols-[64px_minmax(0,1fr)_24px_128px_64px_48px_150px] md:px-5 ${EDGE[ticket.priority] ?? ""}`}
    >
      <span className="order-2 font-mono text-xs text-muted md:order-none">{ticket.ticketNumber}</span>
      <span className="order-1 col-span-2 grid min-w-0 gap-0.5 md:order-none md:col-span-1">
        <span className="truncate font-semibold max-md:whitespace-normal">{ticket.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {ticket.groupId ? ticket.groupId.name : "No group"}
          {ticket.topicIds?.map((topic) => <Tag key={topic._id}>{topic.name}</Tag>)}
          <span className="inline-flex items-center gap-2 md:hidden"><PriorityPill priority={ticket.priority} showLabel={false} /><StatusPill status={ticket.status} />{due && <span className={overdue ? "font-semibold text-danger" : ""}>{due}</span>}</span>
        </span>
      </span>
      <span className="hidden md:block"><PriorityPill priority={ticket.priority} showLabel={false} /></span>
      <span className="hidden md:block"><StatusPill status={ticket.status} /></span>
      <span className={`hidden text-right text-xs md:block ${overdue ? "font-semibold text-danger" : "text-muted"}`}>{due}</span>
      <span className="hidden items-center justify-end gap-1 text-xs text-muted md:inline-flex" title="Comments">{ticket.commentCount ? <><CommentIcon />{ticket.commentCount}</> : null}</span>
      <span className="order-3 flex min-w-0 items-center gap-2 justify-self-end md:order-none md:justify-self-start" title={people.map((p) => p.name).join(", ") || "Unassigned"}>
        <AvatarStack people={people} max={1} />
        <span className="hidden min-w-0 truncate text-xs text-muted md:block">{people.length ? `${people[0].name}${people.length > 1 ? ` +${people.length - 1}` : ""}` : "Unassigned"}</span>
      </span>
    </Link>
  );
}

/** Card with an optional title row, used for settings-style sections. */
export function Panel({ title, description, action, children, className = "" }: { title?: string; description?: string; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-line bg-card shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">{title && <h2 className="text-base font-semibold">{title}</h2>}{description && <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{description}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
