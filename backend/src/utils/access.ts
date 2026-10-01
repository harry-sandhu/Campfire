import { Types } from "mongoose";
import { Group, Ticket } from "../models/index.js";
import type { AuthUser } from "../types/auth.js";
import { notFound } from "./errors.js";

type GroupLike = { creatorIds: unknown[]; leaderIds: unknown[]; memberIds: unknown[] };
const has = (ids: unknown[], userId: string) => ids.some((id) => String(id) === userId);

export const isSuperAdmin = (user: AuthUser) => user.role === "SUPERADMIN";
export const hasPermission = (user: AuthUser, permission: string) => isSuperAdmin(user) || (user.permissions as string[]).includes(permission);
export const isMember = (group: GroupLike, userId: string) => has(group.memberIds, userId);
export const isCreator = (group: GroupLike, userId: string) => has(group.creatorIds, userId);
export const canManageGroup = (group: GroupLike, user: AuthUser) => isSuperAdmin(user) || isCreator(group, user.id) || has(group.leaderIds, user.id);
export const canViewGroup = (group: GroupLike, user: AuthUser) => isSuperAdmin(user) || isMember(group, user.id);

export async function memberGroupIds(userId: string) {
  const groups = await Group.find({ memberIds: userId, deletedAt: null }).select("_id").lean();
  return groups.map((group) => group._id as Types.ObjectId);
}

/**
 * Mongo filter for tickets the user may see. Grouped tickets are visible to group members.
 * Ungrouped tickets are visible only to their creator and assignees. SuperAdmin sees everything.
 */
export async function ticketVisibilityFilter(user: AuthUser): Promise<Record<string, unknown>> {
  if (isSuperAdmin(user)) return {};
  const groupIds = await memberGroupIds(user.id);
  return {
    $or: [
      { groupId: { $in: groupIds } },
      { groupId: null, $or: [{ createdById: user.id }, { assigneeId: user.id }, { assigneeIds: user.id }] },
    ],
  };
}

export async function loadVisibleTicket(ticketId: string, user: AuthUser) {
  const visibility = await ticketVisibilityFilter(user);
  const ticket = await Ticket.findOne({ $and: [{ _id: ticketId, deletedAt: null }, visibility] });
  if (!ticket) throw notFound("TICKET_NOT_FOUND", "Ticket not found");
  return ticket;
}
