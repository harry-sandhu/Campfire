import { TicketTemplate, User } from "../models/index.js";
import { createInput } from "../schemas/ticket.js";
import type { AuthUser } from "../types/auth.js";
import { createTicket } from "./ticket-service.js";

export type Every = "daily" | "weekly" | "monthly";

export function addInterval(from: Date, every: Every) {
  const next = new Date(from);
  if (every === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (every === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** First scheduled time after `now`, skipping any periods missed while the server was asleep. */
export function nextRunAfter(scheduled: Date, every: Every, now: Date) {
  let next = addInterval(scheduled, every);
  while (next <= now) next = addInterval(next, every);
  return next;
}

/**
 * Creates tickets for recurring templates that are due. Safe to call often and from several
 * instances: each template is claimed with a compare-and-set on its nextRunAt before a ticket is made.
 */
export async function runDueRecurrences(now = new Date()) {
  const due = await TicketTemplate.find({ "recurrence.active": true, "recurrence.nextRunAt": { $lte: now } }).limit(50);
  let created = 0;
  for (const template of due) {
    const scheduled = template.recurrence!.nextRunAt!;
    const claimed = await TicketTemplate.findOneAndUpdate(
      { _id: template._id, "recurrence.nextRunAt": scheduled },
      { "recurrence.nextRunAt": nextRunAfter(scheduled, template.recurrence!.every as Every, now) },
    );
    if (!claimed) continue;

    const owner = await User.findOne({ _id: template.createdById, isActive: true, deletedAt: null }).lean();
    if (!owner) {
      await TicketTemplate.updateOne({ _id: template._id }, { "recurrence.active": false });
      continue;
    }
    const user: AuthUser = { id: String(owner._id), name: owner.name, email: owner.email, role: owner.role as AuthUser["role"], permissions: owner.permissions as AuthUser["permissions"] };
    try {
      await createTicket(user, createInput.parse({
        title: template.title, description: template.description, priority: template.priority,
        groupId: template.groupId ? String(template.groupId) : null,
        topicIds: (template.topicIds ?? []).map(String), assigneeIds: (template.assigneeIds ?? []).map(String),
      }));
      created++;
    } catch (error) {
      console.error(`Recurring template ${template._id} failed`, error);
    }
  }
  return created;
}
