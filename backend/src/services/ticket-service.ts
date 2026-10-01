import { ActivityLog, Counter, Group, Milestone, Notification, Ticket, Topic, User } from "../models/index.js";
import { fieldPermission, type CreateInput, type ListQuery, type UpdateInput } from "../schemas/ticket.js";
import type { AuthUser } from "../types/auth.js";
import { canViewGroup, hasPermission, ticketVisibilityFilter } from "../utils/access.js";
import { forbidden, notFound, unprocessable } from "../utils/errors.js";
import { escapeRegex, unique } from "../utils/validation.js";
import { publish } from "./events.js";

export async function nextTicketNumber() {
  const counter = await Counter.findOneAndUpdate({ _id: "tickets" }, { $inc: { value: 1 } }, { upsert: true, new: true });
  return `TKT-${counter.value}`;
}

const printable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(printable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return String(value);
  return value ?? null;
};

export async function recordActivity(ticketId: unknown, actorId: string, type: string, metadata: Record<string, unknown> = {}) {
  const clean = Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, printable(value)]));
  await ActivityLog.create({ ticketId, actorId, type, metadata: clean });
}

/** Notifications must never fail the request that triggered them. */
export async function notify(userIds: string[], ticketId: unknown, type: string, message: string, actorId: string) {
  const recipients = unique(userIds).filter((id) => id && id !== actorId);
  if (!recipients.length) return;
  try {
    await Notification.insertMany(recipients.map((userId) => ({ userId, ticketId, type, message })));
    publish({ type: "notification.created", userIds: recipients });
  } catch (error) {
    console.error("Failed to create notifications", error);
  }
}

/** The users who may see a ticket, restricted to `candidates`: group members (or creator/assignees when ungrouped) plus SuperAdmins. */
export async function filterViewers(ticket: { groupId?: unknown; createdById?: unknown; assigneeIds?: unknown[]; assigneeId?: unknown }, candidates: string[]) {
  if (!candidates.length) return [];
  const allowed = new Set<string>();
  if (ticket.groupId) {
    const group = await Group.findOne({ _id: ticket.groupId, deletedAt: null }).select("memberIds").lean();
    group?.memberIds.forEach((id) => allowed.add(String(id)));
  } else {
    [ticket.createdById, ticket.assigneeId, ...(ticket.assigneeIds ?? [])].filter(Boolean).forEach((id) => allowed.add(String(id)));
  }
  const admins = await User.find({ _id: { $in: candidates }, role: "SUPERADMIN", isActive: true, deletedAt: null }).select("_id").lean();
  admins.forEach((a) => allowed.add(String(a._id)));
  const active = await User.find({ _id: { $in: candidates }, isActive: true, deletedAt: null }).select("_id").lean();
  const activeIds = new Set(active.map((u) => String(u._id)));
  return unique(candidates).filter((id) => allowed.has(id) && activeIds.has(id));
}

/** Everyone who should hear about changes to a ticket: assignees, creator and watchers. */
export const interestedUsers = (ticket: { assigneeIds?: unknown[]; assigneeId?: unknown; watcherIds?: unknown[]; createdById?: unknown }) =>
  unique([...(ticket.assigneeIds ?? []), ticket.assigneeId, ...(ticket.watcherIds ?? []), ticket.createdById].filter(Boolean).map(String));

/**
 * Validates the group, topics, milestone and assignees a ticket is about to have.
 * Ungrouped tickets may only have topic-less, milestone-less tickets with any active user as assignee.
 */
export async function validatePlacement(user: AuthUser, groupId: string | null, topicIds: string[], assigneeIds: string[], milestoneId: string | null = null) {
  let memberIds: string[] | null = null;
  if (groupId) {
    const group = await Group.findOne({ _id: groupId, deletedAt: null }).lean();
    if (!group || !canViewGroup(group, user)) throw forbidden("GROUP_ACCESS_DENIED", "Choose a group you belong to");
    memberIds = group.memberIds.map(String);
    const topics = await Topic.countDocuments({ _id: { $in: topicIds }, groupId, archivedAt: null });
    if (topics !== unique(topicIds).length) throw unprocessable("INVALID_TOPICS", "Topics must be active topics of the selected group");
    if (milestoneId && !(await Milestone.exists({ _id: milestoneId, groupId }))) throw unprocessable("INVALID_MILESTONE", "Milestone must belong to the ticket's group");
  } else {
    if (topicIds.length) throw unprocessable("INVALID_TOPICS", "Topics require a group");
    if (milestoneId) throw unprocessable("INVALID_MILESTONE", "Milestones require a group");
  }

  if (assigneeIds.length) {
    const active = await User.find({ _id: { $in: assigneeIds }, isActive: true, deletedAt: null }).select("_id").lean();
    if (active.length !== unique(assigneeIds).length) throw unprocessable("INVALID_ASSIGNEE", "Assignees must be active users");
    if (memberIds && assigneeIds.some((id) => !memberIds!.includes(id))) {
      throw unprocessable("ASSIGNEE_NOT_IN_GROUP", "Assignees must be members of the ticket's group");
    }
  }
}

/** Parent must be a visible top-level ticket in the same group, and a ticket with subtasks cannot become a subtask. */
async function validateParent(user: AuthUser, ticketId: string | null, parentId: string, groupId: string | null) {
  if (ticketId && parentId === ticketId) throw unprocessable("INVALID_PARENT", "A ticket cannot be its own parent");
  const visibility = await ticketVisibilityFilter(user);
  const parent = await Ticket.findOne({ $and: [{ _id: parentId, deletedAt: null }, visibility] }).lean();
  if (!parent) throw notFound("TICKET_NOT_FOUND", "Parent ticket not found");
  if (parent.parentId) throw unprocessable("INVALID_PARENT", "Subtasks cannot have their own subtasks");
  if (String(parent.groupId ?? "") !== String(groupId ?? "")) throw unprocessable("INVALID_PARENT", "A subtask must be in the same group as its parent");
  if (ticketId && (await Ticket.exists({ parentId: ticketId, deletedAt: null }))) throw unprocessable("INVALID_PARENT", "A ticket that has subtasks cannot become a subtask");
}

export async function createTicket(user: AuthUser, input: CreateInput) {
  const assigneeIds = unique([...input.assigneeIds, ...(input.assigneeId ? [input.assigneeId] : [])]);
  if (assigneeIds.length && !hasPermission(user, "tickets.assign")) throw forbidden("PERMISSION_DENIED", "Assigning tickets requires tickets.assign");
  const groupId = input.groupId ?? null;
  await validatePlacement(user, groupId, input.topicIds, assigneeIds, input.milestoneId ?? null);
  if (input.parentId) await validateParent(user, null, input.parentId, groupId);

  const ticket = await Ticket.create({
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate ?? undefined,
    groupId,
    milestoneId: input.milestoneId ?? null,
    parentId: input.parentId ?? null,
    topicIds: unique(input.topicIds),
    assigneeId: assigneeIds[0] ?? null,
    assigneeIds,
    watcherIds: [user.id],
    ticketNumber: await nextTicketNumber(),
    createdById: user.id,
    updatedById: user.id,
  });
  await recordActivity(ticket._id, user.id, "CREATED", { assigneeIds });
  await notify(assigneeIds, ticket._id, "TICKET_ASSIGNED", `You were assigned ${ticket.ticketNumber}`, user.id);
  publish({ type: "ticket.created", ticketId: String(ticket._id), groupId: groupId ? String(groupId) : null, data: { ticketNumber: ticket.ticketNumber, title: ticket.title } });
  return ticket;
}

/** Applies a partial update after checking per-field permissions and placement rules. */
export async function updateTicket(user: AuthUser, ticket: InstanceType<typeof Ticket>, input: UpdateInput) {
  const fields = Object.keys(input) as (keyof UpdateInput)[];
  if (!fields.length) throw unprocessable("NO_CHANGES", "No editable fields were provided");
  const missing = fields.find((field) => !hasPermission(user, fieldPermission[field]));
  if (missing) throw forbidden("PERMISSION_DENIED", `Changing ${missing} requires ${fieldPermission[missing]}`);

  const before = ticket.toObject();
  const touchesPlacement = ["groupId", "topicIds", "assigneeIds", "assigneeId", "milestoneId", "parentId"].some((key) => key in input);
  const currentGroup = ticket.groupId ? String(ticket.groupId) : null;
  const groupId = "groupId" in input ? input.groupId ?? null : currentGroup;
  const groupChanged = String(groupId ?? "") !== String(currentGroup ?? "");

  if (groupChanged && (ticket.parentId || (await Ticket.exists({ parentId: ticket._id, deletedAt: null })))) {
    throw unprocessable("HAS_SUBTASKS", "Detach this ticket from its parent or subtasks before moving it to another group");
  }

  const topicIds = input.topicIds ?? (groupChanged ? [] : (ticket.topicIds ?? []).map(String));
  const milestoneId = "milestoneId" in input ? input.milestoneId ?? null : groupChanged ? null : ticket.milestoneId ? String(ticket.milestoneId) : null;
  const assigneeIds = "assigneeIds" in input || "assigneeId" in input
    ? unique([...(input.assigneeIds ?? []), ...(input.assigneeId ? [input.assigneeId] : [])])
    : unique([...(ticket.assigneeIds ?? []).map(String), ...(ticket.assigneeId ? [String(ticket.assigneeId)] : [])]);
  if (touchesPlacement) await validatePlacement(user, groupId, topicIds, assigneeIds, milestoneId);
  if (input.parentId) await validateParent(user, String(ticket._id), input.parentId, groupId);

  const changes: Record<string, unknown> = {};
  for (const key of ["title", "description", "priority", "status", "dueDate", "parentId"] as const) if (key in input) changes[key] = input[key] ?? (key === "parentId" ? null : undefined);
  if ("groupId" in input) changes.groupId = groupId;
  if ("topicIds" in input || groupChanged) changes.topicIds = unique(topicIds);
  if ("milestoneId" in input || groupChanged) changes.milestoneId = milestoneId;
  if ("assigneeIds" in input || "assigneeId" in input) {
    changes.assigneeIds = assigneeIds;
    changes.assigneeId = assigneeIds[0] ?? null;
  }
  if (input.status === "COMPLETED" || input.status === "CLOSED") changes.completedAt = ticket.completedAt ?? new Date();
  else if (input.status) changes.completedAt = null;

  const activityKeys = Object.keys(changes).filter((key) => key !== "assigneeId" && key !== "completedAt");
  ticket.set({ ...changes, updatedById: user.id });
  await ticket.save();

  const changed: string[] = [];
  for (const key of activityKeys) {
    const from = (before as any)[key];
    const to = (changes as any)[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
      changed.push(key);
      await recordActivity(ticket._id, user.id, `${key.toUpperCase()}_CHANGED`, { from, to });
    }
  }
  if (changes.assigneeIds) {
    const previous = (before.assigneeIds ?? []).map(String);
    await notify(assigneeIds.filter((id) => !previous.includes(id)), ticket._id, "TICKET_ASSIGNED", `You were assigned ${ticket.ticketNumber}`, user.id);
  }
  if (changed.includes("status")) await notify(interestedUsers(ticket), ticket._id, "TICKET_STATUS", `${ticket.ticketNumber} moved to ${String(ticket.status).toLowerCase().replaceAll("_", " ")}`, user.id);
  if (changed.length) publish({ type: "ticket.updated", ticketId: String(ticket._id), groupId: ticket.groupId ? String(ticket.groupId) : null, data: { ticketNumber: ticket.ticketNumber, title: ticket.title, changed } });
  return ticket;
}

export async function softDeleteTicket(user: AuthUser, ticket: InstanceType<typeof Ticket>) {
  if (!hasPermission(user, "tickets.delete")) throw forbidden("PERMISSION_DENIED", "Permission required: tickets.delete");
  ticket.set({ deletedAt: new Date(), updatedById: user.id });
  await ticket.save();
  await recordActivity(ticket._id, user.id, "DELETED");
  publish({ type: "ticket.deleted", ticketId: String(ticket._id), groupId: ticket.groupId ? String(ticket.groupId) : null, data: { ticketNumber: ticket.ticketNumber, title: ticket.title } });
}

/** Builds the Mongo filter for list, export and search from query parameters, always limited to what the user can see. */
export async function buildTicketFilter(user: AuthUser, q: Partial<ListQuery>) {
  const and: Record<string, unknown>[] = [{ deletedAt: null }, await ticketVisibilityFilter(user)];
  if (q.groupId) and.push({ groupId: q.groupId });
  if (q.topicId) and.push({ topicIds: q.topicId });
  if (q.milestoneId) and.push({ milestoneId: q.milestoneId });
  if (q.status) and.push({ status: q.status });
  if (q.priority) and.push({ priority: q.priority });
  if (q.assigneeId) and.push({ $or: [{ assigneeId: q.assigneeId }, { assigneeIds: q.assigneeId }] });
  if (q.mine === "true") and.push({ $or: [{ assigneeId: user.id }, { assigneeIds: user.id }] });
  if (q.search) {
    const pattern = new RegExp(escapeRegex(q.search), "i");
    and.push({ $or: [{ ticketNumber: pattern }, { title: pattern }, { description: pattern }] });
  }
  return { $and: and };
}
