import { ActivityLog, Counter, Group, Notification, Topic, User } from "../models/index.js";
import type { AuthUser } from "../types/auth.js";
import { canViewGroup } from "../utils/access.js";
import { forbidden, unprocessable } from "../utils/errors.js";
import { unique } from "../utils/validation.js";

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
  } catch (error) {
    console.error("Failed to create notifications", error);
  }
}

/**
 * Validates the group, topics and assignees a ticket is about to have.
 * Ungrouped tickets may only have topic-less, any-active-user assignees.
 */
export async function validatePlacement(user: AuthUser, groupId: string | null, topicIds: string[], assigneeIds: string[]) {
  let memberIds: string[] | null = null;
  if (groupId) {
    const group = await Group.findOne({ _id: groupId, deletedAt: null }).lean();
    if (!group || !canViewGroup(group, user)) throw forbidden("GROUP_ACCESS_DENIED", "Choose a group you belong to");
    memberIds = group.memberIds.map(String);
    const topics = await Topic.countDocuments({ _id: { $in: topicIds }, groupId, archivedAt: null });
    if (topics !== unique(topicIds).length) throw unprocessable("INVALID_TOPICS", "Topics must be active topics of the selected group");
  } else if (topicIds.length) {
    throw unprocessable("INVALID_TOPICS", "Topics require a group");
  }

  if (assigneeIds.length) {
    const active = await User.find({ _id: { $in: assigneeIds }, isActive: true, deletedAt: null }).select("_id").lean();
    if (active.length !== unique(assigneeIds).length) throw unprocessable("INVALID_ASSIGNEE", "Assignees must be active users");
    if (memberIds && assigneeIds.some((id) => !memberIds!.includes(id))) {
      throw unprocessable("ASSIGNEE_NOT_IN_GROUP", "Assignees must be members of the ticket's group");
    }
  }
}
