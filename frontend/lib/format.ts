import type { Ref, Ticket } from "./types";

export const label = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

export const assigneesOf = (ticket: Ticket): Ref[] => (ticket.assigneeIds?.length ? ticket.assigneeIds : ticket.assigneeId ? [ticket.assigneeId] : []);

export const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export function timeAgo(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

export const isOverdue = (ticket: Ticket) => !!ticket.dueDate && new Date(ticket.dueDate) < new Date() && !["COMPLETED", "CLOSED"].includes(ticket.status);
