import { z } from "zod";
import { Automation, AutomationFire, AutomationRun, Comment, Group, Milestone, Ticket, Webhook } from "../models/index.js";
import { priorities, statuses } from "../schemas/ticket.js";
import type { AuthUser } from "../types/auth.js";
import { unique } from "../utils/validation.js";
import { automationContext, publish, subscribe, type DomainEvent } from "./events.js";
import { notify, recordActivity, updateTicket } from "./ticket-service.js";
import { deliverWebhook } from "./webhooks.js";

export const TRIGGERS = ["ticket.created", "ticket.status_changed", "ticket.assigned", "ticket.priority_changed", "comment.created", "ticket.overdue", "ticket.stuck", "milestone.completed"] as const;
export const ACTIONS = ["notify_user", "notify_leaders", "notify_assignees", "post_slack", "assign", "set_priority", "set_status", "set_milestone", "add_comment", "close_milestone"] as const;

export const MAX_AUTOMATIONS_PER_GROUP = 20;
export const MAX_ACTIONS = 5;
/** An automation chain (rule A triggers rule B triggers rule C …) stops at this length. */
const MAX_CHAIN = 3;
const DONE = ["COMPLETED", "CLOSED"];

const objectIdString = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const triggerSchema = z.object({
  type: z.enum(TRIGGERS),
  /** For status_changed and priority_changed: only fire when the ticket changed to this value. */
  to: z.string().max(30).optional(),
  /** For stuck: which status, and for how many days. */
  status: z.enum(statuses).optional(),
  days: z.number().int().min(1).max(90).optional(),
});

export const conditionSchema = z.object({
  field: z.enum(["priority", "status", "assignee", "topic"]),
  op: z.enum(["is", "is_not"]),
  value: z.string().min(1).max(40),
});

export const actionSchema = z.object({
  type: z.enum(ACTIONS),
  userId: objectIdString.optional(),
  milestoneId: objectIdString.optional(),
  priority: z.enum(priorities).optional(),
  status: z.enum(statuses).optional(),
  message: z.string().max(300).optional(),
  body: z.string().max(2000).optional(),
});

export type Trigger = z.infer<typeof triggerSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Action = z.infer<typeof actionSchema>;
type TicketDoc = InstanceType<typeof Ticket>;
type AutomationLike = { _id: unknown; groupId: unknown; createdById: unknown; name: string; trigger: Trigger; conditions: Condition[]; actions: Action[] };

/** What each action needs. Used to validate rules when they are saved. */
export function missingActionField(action: Action) {
  const need: Partial<Record<Action["type"], keyof Action>> = { notify_user: "userId", assign: "userId", set_priority: "priority", set_status: "status", set_milestone: "milestoneId", add_comment: "body" };
  const field = need[action.type];
  return field && !action[field] ? field : null;
}

export function describeAction(action: Action) {
  switch (action.type) {
    case "notify_user": return "Notify a person";
    case "notify_leaders": return "Notify the group leaders";
    case "notify_assignees": return "Notify the assignees";
    case "post_slack": return "Post to the group's Slack webhook";
    case "assign": return "Add an assignee";
    case "set_priority": return `Set priority to ${action.priority}`;
    case "set_status": return `Set status to ${action.status}`;
    case "set_milestone": return "Move the ticket to a milestone";
    case "add_comment": return "Add a comment";
    case "close_milestone": return "Close the ticket's milestone";
  }
}

const render = (text: string | undefined, ticket: TicketDoc, fallback: string) =>
  (text?.trim() ? text : fallback).replaceAll("{ticket}", ticket.ticketNumber).replaceAll("{title}", ticket.title);

const assigneesOf = (ticket: TicketDoc) => unique([...(ticket.assigneeIds ?? []).map(String), ...(ticket.assigneeId ? [String(ticket.assigneeId)] : [])]);

export function matchesConditions(conditions: Condition[], ticket: TicketDoc) {
  return conditions.every((c) => {
    let hit: boolean;
    if (c.field === "priority") hit = ticket.priority === c.value;
    else if (c.field === "status") hit = ticket.status === c.value;
    else if (c.field === "topic") hit = (ticket.topicIds ?? []).map(String).includes(c.value);
    else hit = c.value === "nobody" ? assigneesOf(ticket).length === 0 : assigneesOf(ticket).includes(c.value);
    return c.op === "is" ? hit : !hit;
  });
}

/** Everything the engine does for a ticket, run as the group on behalf of the person who built the rule. */
async function runAction(automation: AutomationLike, ticket: TicketDoc, action: Action) {
  const actor: AuthUser = { id: String(automation.createdById), role: "SUPERADMIN", permissions: [], name: `Automation: ${automation.name}`, email: "" };
  const message = render(action.message, ticket, `${automation.name}: ${ticket.ticketNumber} ${ticket.title}`);
  const groupId = ticket.groupId ? String(ticket.groupId) : null;
  switch (action.type) {
    case "notify_user": await notify([action.userId!], ticket._id, "AUTOMATION", message, ""); return;
    case "notify_assignees": await notify(assigneesOf(ticket), ticket._id, "AUTOMATION", message, ""); return;
    case "notify_leaders": {
      const group = await Group.findById(ticket.groupId).select("leaderIds creatorIds").lean();
      await notify([...(group?.leaderIds ?? []), ...(group?.creatorIds ?? [])].map(String), ticket._id, "AUTOMATION", message, "");
      return;
    }
    case "post_slack": {
      const hooks = await Webhook.find({ groupId: ticket.groupId, active: true, format: "slack" }).lean();
      if (!hooks.length) throw new Error("This group has no active Slack webhook");
      for (const hook of hooks) void deliverWebhook(hook, "ticket.updated", groupId!, String(ticket._id), { ticketNumber: ticket.ticketNumber, title: ticket.title, automationMessage: `${message}` });
      return;
    }
    case "assign": await updateTicket(actor, ticket, { assigneeIds: unique([...assigneesOf(ticket), action.userId!]) }); return;
    case "set_priority": await updateTicket(actor, ticket, { priority: action.priority! }); return;
    case "set_status": await updateTicket(actor, ticket, { status: action.status! }); return;
    case "set_milestone": await updateTicket(actor, ticket, { milestoneId: action.milestoneId! }); return;
    case "close_milestone":
      if (ticket.milestoneId) await Milestone.updateOne({ _id: ticket.milestoneId, closedAt: null }, { closedAt: new Date() });
      return;
    case "add_comment": {
      const body = render(action.body, ticket, "");
      await Comment.create({ ticketId: ticket._id, authorId: automation.createdById, body: `Automation “${automation.name}”: ${body}` });
      publish({ type: "comment.created", ticketId: String(ticket._id), groupId, data: { ticketNumber: ticket.ticketNumber, title: ticket.title, author: "Automation", body } });
      return;
    }
  }
}

/** Runs all actions of one automation for one ticket. A failing action is logged and the rest still run. */
export async function runAutomation(automation: AutomationLike, ticket: TicketDoc, chain: string[]) {
  const errors: string[] = [];
  await automationContext.run({ chain: [...chain, String(automation._id)] }, async () => {
    for (const action of automation.actions) {
      try { await runAction(automation, ticket, action); } catch (error) { errors.push(`${action.type}: ${(error as Error).message}`); }
    }
  });
  await recordActivity(ticket._id, String(automation.createdById), "AUTOMATION_RAN", { automation: automation.name, failed: errors.length }).catch(() => undefined);
  const failed = errors.length > 0;
  await AutomationRun.create({ automationId: automation._id, groupId: automation.groupId, ticketId: ticket._id, ok: !failed, error: failed ? errors.join("; ").slice(0, 500) : undefined }).catch(() => undefined);
  await Automation.updateOne({ _id: automation._id }, { lastRunAt: new Date(), $inc: { runCount: 1, failCount: failed ? 1 : 0 } }).catch(() => undefined);
}

function triggersFor(event: DomainEvent): string[] {
  if (event.type === "ticket.created") return ["ticket.created"];
  if (event.type === "comment.created") return ["comment.created"];
  if (event.type !== "ticket.updated") return [];
  const changed = (event.data?.changed ?? []) as string[];
  const found: string[] = [];
  if (changed.includes("status")) found.push("ticket.status_changed", "milestone.completed");
  if (changed.includes("assigneeIds")) found.push("ticket.assigned");
  if (changed.includes("priority")) found.push("ticket.priority_changed");
  return found;
}

async function milestoneIsComplete(ticket: TicketDoc) {
  if (!ticket.milestoneId || !DONE.includes(ticket.status)) return false;
  const milestone = await Milestone.findById(ticket.milestoneId).select("closedAt").lean();
  if (!milestone || milestone.closedAt) return false;
  const open = await Ticket.countDocuments({ milestoneId: ticket.milestoneId, deletedAt: null, status: { $nin: DONE } });
  return open === 0;
}

async function triggerMatches(trigger: Trigger, ticket: TicketDoc) {
  switch (trigger.type) {
    case "ticket.status_changed": return !trigger.to || ticket.status === trigger.to;
    case "ticket.priority_changed": return !trigger.to || ticket.priority === trigger.to;
    case "milestone.completed": return milestoneIsComplete(ticket);
    default: return true;
  }
}

async function handleEvent(event: DomainEvent) {
  const chain = event.automationChain ?? [];
  if (!event.groupId || !event.ticketId || chain.length >= MAX_CHAIN) return;
  const types = triggersFor(event);
  if (!types.length) return;
  const automations = (await Automation.find({ groupId: event.groupId, active: true, "trigger.type": { $in: types } }).lean()) as unknown as AutomationLike[];
  if (!automations.length) return;
  const ticket = await Ticket.findOne({ _id: event.ticketId, deletedAt: null });
  if (!ticket) return;
  for (const automation of automations) {
    if (chain.includes(String(automation._id))) continue; // never let a rule re-trigger itself
    if (!(await triggerMatches(automation.trigger, ticket)) || !matchesConditions(automation.conditions ?? [], ticket)) continue;
    await runAutomation(automation, ticket, chain);
  }
}

export function startAutomationEngine() {
  return subscribe((event) => void handleEvent(event).catch((error) => console.error("Automation failed", error)));
}

/** Claims (automation, ticket, marker) so a time-based rule fires once, even with several server instances. */
async function claim(automationId: unknown, ticketId: unknown, marker: string) {
  try { await AutomationFire.create({ automationId, ticketId, marker }); return true; } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

/** Overdue and stuck rules. Runs on the same timer as recurring tickets. */
export async function runTimeAutomations(now = new Date()) {
  const automations = (await Automation.find({ active: true, "trigger.type": { $in: ["ticket.overdue", "ticket.stuck"] } }).lean()) as unknown as AutomationLike[];
  let fired = 0;
  for (const automation of automations) {
    const { trigger } = automation;
    const filter: Record<string, unknown> = { groupId: automation.groupId, deletedAt: null };
    if (trigger.type === "ticket.overdue") Object.assign(filter, { status: { $nin: DONE }, dueDate: { $lt: now } });
    else Object.assign(filter, { status: trigger.status ?? "BLOCKED", updatedAt: { $lt: new Date(now.getTime() - (trigger.days ?? 3) * 86400000) } });
    const tickets = await Ticket.find(filter).limit(100);
    for (const ticket of tickets) {
      if (!matchesConditions(automation.conditions ?? [], ticket)) continue;
      const marker = trigger.type === "ticket.overdue" ? String(ticket.dueDate?.getTime() ?? "") : String(ticket.updatedAt?.getTime() ?? "");
      if (!(await claim(automation._id, ticket._id, marker))) continue;
      await runAutomation(automation, ticket, []);
      fired++;
    }
  }
  return fired;
}

/** Tells group leaders once when an open milestone is due within three days. */
export async function runMilestoneAlerts(now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86400000);
  const due = await Milestone.find({ closedAt: null, dueSoonNotifiedAt: null, dueDate: { $ne: null, $lte: soon } }).limit(100);
  let sent = 0;
  for (const milestone of due) {
    const claimed = await Milestone.updateOne({ _id: milestone._id, dueSoonNotifiedAt: null }, { dueSoonNotifiedAt: now });
    if (!claimed.modifiedCount) continue;
    const group = await Group.findOne({ _id: milestone.groupId, deletedAt: null }).select("name leaderIds creatorIds").lean();
    if (!group) continue;
    const overdue = milestone.dueDate! < now;
    await notify([...(group.leaderIds ?? []), ...(group.creatorIds ?? [])].map(String), undefined, "MILESTONE_DUE", `Milestone “${milestone.name}” in ${group.name} is ${overdue ? "overdue" : "due soon"}`, "");
    sent++;
  }
  return sent;
}
