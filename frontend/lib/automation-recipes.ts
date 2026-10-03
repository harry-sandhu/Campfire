import type { AutomationInput } from "./types";

/** A recipe is a ready-made automation with a few blanks the person fills in (`needs`). */
export type Recipe = {
  id: string;
  title: string;
  description: string;
  needs?: ("person" | "milestone")[];
  build: (picked: { userId?: string; milestoneId?: string }) => AutomationInput;
};

export const RECIPES: Recipe[] = [
  { id: "urgent-leaders", title: "Urgent ticket → tell the leaders", description: "When an urgent ticket is created, notify the group leaders.",
    build: () => ({ name: "Urgent ticket → notify leaders", trigger: { type: "ticket.created" }, conditions: [{ field: "priority", op: "is", value: "URGENT" }], actions: [{ type: "notify_leaders", message: "Urgent: {ticket} {title}" }] }) },
  { id: "urgent-slack", title: "Urgent ticket → post to Slack", description: "Sends a message to the group's Slack webhook when an urgent ticket is created.",
    build: () => ({ name: "Urgent ticket → Slack", trigger: { type: "ticket.created" }, conditions: [{ field: "priority", op: "is", value: "URGENT" }], actions: [{ type: "post_slack", message: "Urgent ticket {ticket}: {title}" }] }) },
  { id: "blocked-3d", title: "Blocked for 3 days → nudge", description: "If a ticket stays blocked for 3 days, comment on it and tell the leaders.",
    build: () => ({ name: "Blocked for 3 days", trigger: { type: "ticket.stuck", status: "BLOCKED", days: 3 }, conditions: [], actions: [{ type: "add_comment", body: "{ticket} has been blocked for 3 days. Does it need help?" }, { type: "notify_leaders", message: "{ticket} is still blocked" }] }) },
  { id: "review-assign", title: "Moved to In Review → assign a reviewer", description: "When a ticket moves to In Review, add the chosen person as an assignee.", needs: ["person"],
    build: ({ userId }) => ({ name: "In review → assign reviewer", trigger: { type: "ticket.status_changed", to: "IN_REVIEW" }, conditions: [], actions: [{ type: "assign", userId }] }) },
  { id: "overdue", title: "Overdue → notify assignees", description: "When a ticket passes its due date unfinished, remind its assignees.",
    build: () => ({ name: "Overdue reminder", trigger: { type: "ticket.overdue" }, conditions: [], actions: [{ type: "notify_assignees", message: "{ticket} is overdue: {title}" }] }) },
  { id: "milestone-done", title: "Milestone finished → close it and tell Slack", description: "When the last ticket of a milestone is completed, close the milestone and post to Slack.",
    build: () => ({ name: "Milestone finished", trigger: { type: "milestone.completed" }, conditions: [], actions: [{ type: "close_milestone" }, { type: "post_slack", message: "Milestone complete! Last ticket: {ticket}" }] }) },
  { id: "unassigned", title: "New ticket with no assignee → assign someone", description: "Tickets created without an assignee go to the chosen person.", needs: ["person"],
    build: ({ userId }) => ({ name: "Unassigned → default assignee", trigger: { type: "ticket.created" }, conditions: [{ field: "assignee", op: "is", value: "nobody" }], actions: [{ type: "assign", userId }] }) },
];

export const TRIGGER_LABELS: Record<string, string> = {
  "ticket.created": "A ticket is created",
  "ticket.status_changed": "A ticket's status changes",
  "ticket.assigned": "A ticket is assigned",
  "ticket.priority_changed": "A ticket's priority changes",
  "comment.created": "A comment is added",
  "ticket.overdue": "A ticket becomes overdue",
  "ticket.stuck": "A ticket sits in a status too long",
  "milestone.completed": "A milestone's last ticket is done",
};

export const ACTION_LABELS: Record<string, string> = {
  notify_user: "Notify a person",
  notify_leaders: "Notify the group leaders",
  notify_assignees: "Notify the assignees",
  post_slack: "Post to Slack",
  assign: "Add an assignee",
  set_priority: "Set priority",
  set_status: "Set status",
  set_milestone: "Move to a milestone",
  add_comment: "Add a comment",
  close_milestone: "Close the milestone",
};
