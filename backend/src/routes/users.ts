import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS, isPermission } from "../constants/permissions.js";
import { ROLE_TEMPLATES } from "../constants/role-templates.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Group, RefreshToken, User } from "../models/index.js";
import { canViewGroup, hasPermission, isSuperAdmin } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, badRequest, forbidden, notFound, unprocessable } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { hashPassword } from "../utils/security.js";
import { objectId, unique } from "../utils/validation.js";
import type { AuthUser } from "../types/auth.js";
import { audit } from "../services/audit.js";

const router = Router();
router.use(authenticate);

const password = z.string().min(8).max(128);
const permissionList = z.array(z.string()).max(PERMISSIONS.length);
const defaultUserPermissions = ["tickets.view", "tickets.create", "tickets.assign", "comments.view", "comments.create", "ticket_links.view"];

const hasAnyPermission = (user: AuthUser, permissions: string[]) => permissions.some((p) => hasPermission(user, p));
const output = (u: any) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, permissions: u.permissions, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });

function assertValidPermissions(permissions: string[]) {
  if (permissions.some((p) => !isPermission(p))) throw unprocessable("INVALID_PERMISSION", "Unknown permission");
}

/** Users may only grant or revoke permissions they hold themselves. */
function assertCanDelegate(actor: AuthUser, current: string[], next: string[]) {
  if (isSuperAdmin(actor)) return;
  const changed = [...next.filter((p) => !current.includes(p)), ...current.filter((p) => !next.includes(p))];
  const notHeld = changed.find((p) => !actor.permissions.includes(p as never));
  if (notHeld) throw forbidden("PERMISSION_DENIED", `You cannot change ${notHeld} because you do not hold it`);
}

async function loadManagedUser(id: unknown) {
  const user = await User.findOne({ _id: objectId.parse(id), role: "USER", deletedAt: null });
  if (!user) throw notFound("USER_NOT_FOUND", "User not found");
  return user;
}

/** Minimal directory for assignee pickers. Optionally limited to the members of a group. */
router.get("/assignees", requirePermission("tickets.assign"), handle(async (request, response) => {
  const { groupId } = z.object({ groupId: objectId.optional() }).parse(request.query);
  const filter: Record<string, unknown> = { deletedAt: null, isActive: true };
  if (groupId) {
    const group = await Group.findOne({ _id: groupId, deletedAt: null }).lean();
    if (!group || !canViewGroup(group, request.user!)) throw notFound("GROUP_NOT_FOUND", "Group not found");
    filter._id = { $in: group.memberIds };
  }
  const users = await User.find(filter).select("name email").sort({ name: 1 }).lean();
  ok(response, { users: users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })) });
}));

router.get("/role-templates", handle(async (request, response) => {
  const user = request.user!;
  if (!hasAnyPermission(user, ["users.edit", "users.create"])) throw forbidden("PERMISSION_DENIED", "Permission required: users.edit");
  ok(response, { templates: ROLE_TEMPLATES });
}));

router.get("/", requirePermission("users.view"), handle(async (_request, response) => {
  const users = await User.find({ deletedAt: null }).sort({ name: 1 }).lean();
  ok(response, { users: users.map(output), permissions: PERMISSIONS });
}));

router.post("/", requirePermission("users.create"), handle(async (request, response) => {
  const input = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email(), temporaryPassword: password, permissions: permissionList.default([]) }).parse(request.body);
  assertValidPermissions(input.permissions);
  assertCanDelegate(request.user!, defaultUserPermissions, unique([...defaultUserPermissions, ...input.permissions]));
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new HttpError(409, "EMAIL_IN_USE", "Email is already in use");
  const user = await User.create({ name: input.name, email, passwordHash: await hashPassword(input.temporaryPassword), permissions: unique([...defaultUserPermissions, ...input.permissions]), mustChangePassword: true });
  await audit(request, request.user!.id, { action: "USER_CREATED", targetType: "User", targetId: user._id, summary: `Created user ${user.email}` });
  ok(response, output(user), 201);
}));

router.patch("/:id", requirePermission("users.edit"), handle(async (request, response) => {
  const input = z.object({ name: z.string().trim().min(1).max(120).optional(), permissions: permissionList.optional() }).parse(request.body);
  const user = await loadManagedUser(request.params.id);
  const permissionsBefore = [...user.permissions];
  if (input.permissions) {
    assertValidPermissions(input.permissions);
    if (!isSuperAdmin(request.user!) && String(user._id) === request.user!.id) throw forbidden("PERMISSION_DENIED", "You cannot change your own permissions");
    assertCanDelegate(request.user!, user.permissions, unique(input.permissions));
    user.permissions = unique(input.permissions);
  }
  if (input.name) user.name = input.name;
  await user.save();
  if (input.permissions) {
    const added = user.permissions.filter((p) => !permissionsBefore.includes(p));
    const removed = permissionsBefore.filter((p) => !user.permissions.includes(p));
    if (added.length || removed.length) await audit(request, request.user!.id, { action: "PERMISSIONS_CHANGED", targetType: "User", targetId: user._id, summary: `Changed permissions of ${user.email}`, metadata: { added, removed } });
  }
  ok(response, output(user));
}));

router.patch("/:id/status", requirePermission("users.disable"), handle(async (request, response) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(request.body);
  const user = await loadManagedUser(request.params.id);
  if (String(user._id) === request.user!.id) throw badRequest("SELF_DISABLE", "You cannot disable your own account");
  user.isActive = isActive;
  await user.save();
  if (!isActive) await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit(request, request.user!.id, { action: isActive ? "USER_ENABLED" : "USER_DISABLED", targetType: "User", targetId: user._id, summary: `${isActive ? "Enabled" : "Disabled"} ${user.email}` });
  ok(response, output(user));
}));

/** One-off maintenance helper kept for compatibility; SuperAdmin only. */
router.post("/grant-ticket-access", handle(async (request, response) => {
  if (!isSuperAdmin(request.user!)) throw forbidden("PERMISSION_DENIED", "Only a SuperAdmin can do this");
  const result = await User.updateMany({ role: "USER", deletedAt: null }, { $addToSet: { permissions: "tickets.assign" } });
  ok(response, { updated: result.modifiedCount });
}));

router.delete("/:id", requirePermission("users.edit"), handle(async (request, response) => {
  const user = await loadManagedUser(request.params.id);
  if (String(user._id) === request.user!.id) throw badRequest("SELF_DELETE", "You cannot delete your own account");
  user.set({ isActive: false, deletedAt: new Date() });
  await user.save();
  await Promise.all([
    RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() }),
    Group.updateMany({ memberIds: user._id }, { $pull: { memberIds: user._id, leaderIds: user._id, creatorIds: user._id } }),
  ]);
  await audit(request, request.user!.id, { action: "USER_DELETED", targetType: "User", targetId: user._id, summary: `Deleted ${user.email}` });
  ok(response, null);
}));

router.post("/:id/reset-password", requirePermission("users.edit"), handle(async (request, response) => {
  const { temporaryPassword } = z.object({ temporaryPassword: password }).parse(request.body);
  const user = await loadManagedUser(request.params.id);
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  await user.save();
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit(request, request.user!.id, { action: "PASSWORD_RESET", targetType: "User", targetId: user._id, summary: `Reset password for ${user.email}` });
  ok(response, null);
}));

export { router as usersRouter };
