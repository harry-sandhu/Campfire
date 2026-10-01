import Link from "next/link";
import { assigneesOf, formatDate, isOverdue, label } from "../lib/format";
import type { Ref, Ticket } from "../lib/types";
import { CommentIcon } from "./icons";

export const Spinner = () => <div className="center-block"><div className="spinner" role="status" aria-label="Loading" /></div>;
export const ErrorNote = ({ message }: { message: string }) => (message ? <p className="error" role="alert">{message}</p> : null);

/** Placeholder lines shown while a page loads, so the layout does not jump. */
export function Skeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`skeleton-list ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row"><span className="skeleton" style={{ width: 54 }} /><span className="skeleton" style={{ width: `${48 + ((i * 17) % 38)}%` }} /></div>)}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return <div className="empty"><p className="empty-title">{title}</p>{hint && <p className="muted">{hint}</p>}{action && <div className="empty-action">{action}</div>}</div>;
}

const STATUS_COLOR: Record<string, string> = { OPEN: "var(--s-open)", IN_PROGRESS: "var(--s-progress)", IN_REVIEW: "var(--s-review)", BLOCKED: "var(--s-blocked)", COMPLETED: "var(--s-done)", CLOSED: "var(--s-closed)" };
export const statusColor = (status: string) => STATUS_COLOR[status] ?? "var(--s-open)";

/** Small coloured dot with plain text: quieter than a pill and readable without colour. */
export const StatusPill = ({ status }: { status: string }) => <span className="status-dot-label"><i style={{ background: statusColor(status) }} aria-hidden="true" />{label(status)}</span>;

const LEVEL: Record<string, number> = { NO_PRIORITY: 0, LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const PRIORITY_COLOR: Record<string, string> = { NO_PRIORITY: "var(--muted)", LOW: "var(--muted)", MEDIUM: "var(--muted)", HIGH: "var(--p-high)", URGENT: "var(--p-urgent)" };

/** Four ascending bars; the number lit shows the level. The text label stays for screen readers and wider rows. */
export function PriorityPill({ priority, showLabel = true }: { priority: string; showLabel?: boolean }) {
  const level = LEVEL[priority] ?? 0;
  return (
    <span className="prio" style={{ color: PRIORITY_COLOR[priority] }} title={label(priority)}>
      <span className="prio-bars" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= level ? "on" : ""} style={{ height: 3 + n * 3 }} />)}</span>
      <span className={showLabel ? "" : "sr-only"}>{label(priority)}</span>
    </span>
  );
}

export function Stat({ label: text, value, alert }: { label: string; value: number | string; alert?: boolean }) {
  return <div className={`stat${alert && Number(value) > 0 ? " alert" : ""}`}><strong>{value}</strong><span>{text}</span></div>;
}

const TONES = ["#8c5a3c", "#5f7a5a", "#4f6d8a", "#8a5a7a", "#9a7430", "#5a6b73"];
const toneFor = (name: string) => TONES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % TONES.length];

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: toneFor(name) }}>{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

export function AvatarStack({ people, max = 3 }: { people: Pick<Ref, "name">[]; max?: number }) {
  if (!people.length) return <span className="muted">—</span>;
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack" title={people.map((p) => p.name).join(", ")}>
      {shown.map((p, i) => <Avatar key={i} name={p.name} size={22} />)}
      {people.length > max && <span className="avatar more" aria-hidden="true">+{people.length - max}</span>}
      <span className="sr-only">{people.map((p) => p.name).join(", ")}</span>
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => <span key={i}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}{i < items.length - 1 && <span className="sep" aria-hidden="true">/</span>}</span>)}
    </nav>
  );
}

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const people = assigneesOf(ticket);
  const urgent = ticket.priority === "URGENT" || ticket.priority === "HIGH";
  return (
    <Link className={`ticket-row${urgent ? ` edge-${ticket.priority.toLowerCase()}` : ""}`} href={`/tickets/${ticket.id}`}>
      <span className="ticket-id">{ticket.ticketNumber}</span>
      <span className="ticket-main">
        <span className="ticket-title">{ticket.title}</span>
        <span className="ticket-meta">
          {ticket.groupId ? ticket.groupId.name : "No group"}
          {ticket.topicIds?.map((topic) => <span className="tag" key={topic._id}>{topic.name}</span>)}
        </span>
      </span>
      <span className="row-prio"><PriorityPill priority={ticket.priority} showLabel={false} /></span>
      <StatusPill status={ticket.status} />
      <span className={`row-due${isOverdue(ticket) ? " overdue" : ""}`}>{ticket.dueDate ? formatDate(ticket.dueDate).replace(/, \d{4}$/, "") : ""}</span>
      <span className="row-comments" title="Comments">{ticket.commentCount ? <><CommentIcon />{ticket.commentCount}</> : null}</span>
      <span className="row-people"><AvatarStack people={people} /></span>
    </Link>
  );
}
