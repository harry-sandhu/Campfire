import Link from "next/link";
import { assigneesOf, formatDate, isOverdue, label } from "../lib/format";
import type { Ticket } from "../lib/types";

export const Spinner = () => <div className="center-block"><div className="spinner" role="status" aria-label="Loading" /></div>;
export const ErrorNote = ({ message }: { message: string }) => (message ? <p className="error" role="alert">{message}</p> : null);

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{hint && <p className="muted">{hint}</p>}{action}</div>;
}

export const PriorityPill = ({ priority }: { priority: string }) => <span className={`pill ${priority.toLowerCase()}`}>{label(priority)}</span>;
export const StatusPill = ({ status }: { status: string }) => <span className={`status-pill s-${status.toLowerCase()}`}>{label(status)}</span>;

export function Stat({ label: text, value, tone }: { label: string; value: number | string; tone: string }) {
  return <div className="stat"><span className={`stat-dot ${tone}`} /><div><strong>{value}</strong><span>{text}</span></div></div>;
}

export function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden="true">{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

export function TicketRow({ ticket }: { ticket: Ticket }) {
  const people = assigneesOf(ticket);
  return (
    <Link className="ticket-row" href={`/tickets/${ticket.id}`}>
      <span className="ticket-id">{ticket.ticketNumber}</span>
      <span className="ticket-main">
        <span className="ticket-title">{ticket.title}</span>
        <span className="ticket-meta">
          {ticket.groupId ? ticket.groupId.name : "No group"}
          {ticket.topicIds?.map((topic) => <span className="chip" key={topic._id}>{topic.name}</span>)}
          {isOverdue(ticket) && <span className="chip overdue">Overdue · {formatDate(ticket.dueDate)}</span>}
        </span>
      </span>
      <PriorityPill priority={ticket.priority} />
      <StatusPill status={ticket.status} />
      <span className="assignee">{people.length ? people.map((p) => p.name).join(", ") : "Unassigned"}</span>
    </Link>
  );
}
