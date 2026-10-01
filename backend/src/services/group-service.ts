import type { Request } from "express";
import { Group } from "../models/index.js";
import { canManageGroup, canViewGroup } from "../utils/access.js";
import { forbidden, notFound } from "../utils/errors.js";
import { objectId } from "../utils/validation.js";

export async function loadGroup(id: unknown) {
  const group = await Group.findOne({ _id: objectId.parse(id), deletedAt: null });
  if (!group) throw notFound("GROUP_NOT_FOUND", "Group not found");
  return group;
}

/** Non-members get a 404 so group existence is not revealed. */
export async function loadViewableGroup(request: Request, param = "id") {
  const group = await loadGroup(request.params[param]);
  if (!canViewGroup(group, request.user!)) throw notFound("GROUP_NOT_FOUND", "Group not found");
  return group;
}

export async function loadManageableGroup(request: Request, param = "id") {
  const group = await loadViewableGroup(request, param);
  if (!canManageGroup(group, request.user!)) throw forbidden("GROUP_ACCESS_DENIED", "Only group leaders and creators can do this");
  return group;
}
