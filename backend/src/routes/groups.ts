import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Group, Ticket, Topic, User } from "../models/index.js";
import { canManageGroup, canViewGroup, isCreator, isMember, isSuperAdmin } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, badRequest, forbidden, notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { escapeRegex, objectId } from "../utils/validation.js";
import { audit } from "../services/audit.js";

const router = Router();
router.use(authenticate);

const nameField = z.string().trim().min(1).max(120);
const toView = (group: any) => ({ ...group, id: String(group._id), _id: undefined });

async function loadGroup(id: unknown) {
  const group = await Group.findOne({ _id: objectId.parse(id), deletedAt: null });
  if (!group) throw notFound("GROUP_NOT_FOUND", "Group not found");
  return group;
}

/** Non-members get a 404 so group existence is not revealed. */
async function loadViewableGroup(request: any) {
  const group = await loadGroup(request.params.id);
  if (!canViewGroup(group, request.user)) throw notFound("GROUP_NOT_FOUND", "Group not found");
  return group;
}

async function loadManageableGroup(request: any) {
  const group = await loadViewableGroup(request);
  if (!canManageGroup(group, request.user)) throw forbidden("GROUP_ACCESS_DENIED", "Only group leaders and creators can do this");
  return group;
}

async function assertNameFree(name: string, exceptId?: unknown) {
  const clash = await Group.exists({ name: new RegExp(`^${escapeRegex(name)}$`, "i"), deletedAt: null, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw new HttpError(409, "GROUP_NAME_TAKEN", "A group with that name already exists");
}

router.get("/", handle(async (request, response) => {
  const user = request.user!;
  const filter = isSuperAdmin(user) ? { deletedAt: null } : { memberIds: user.id, deletedAt: null };
  const groups = await Group.find(filter).sort({ name: 1 }).lean();
  ok(response, { groups: groups.map(toView) });
}));

router.post("/", requirePermission("groups.create"), handle(async (request, response) => {
  const input = z.object({ name: nameField, description: z.string().max(1000).default("") }).parse(request.body);
  await assertNameFree(input.name);
  const userId = request.user!.id;
  const group = await Group.create({ ...input, memberIds: [userId], leaderIds: [userId], creatorIds: [userId] });
  await audit(request, userId, { action: "GROUP_CREATED", targetType: "Group", targetId: group._id, summary: `Created group ${group.name}` });
  ok(response, toView(group.toObject()), 201);
}));

router.get("/:id", handle(async (request, response) => {
  const group = await loadViewableGroup(request);
  const [members, topics] = await Promise.all([
    User.find({ _id: { $in: group.memberIds }, deletedAt: null }).select("name email").sort({ name: 1 }).lean(),
    Topic.find({ groupId: group._id }).sort({ name: 1 }).lean(),
  ]);
  ok(response, { group: toView(group.toObject()), members: members.map((m) => ({ ...m, id: String(m._id) })), topics: topics.map(toView) });
}));

router.patch("/:id", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = z.object({ name: nameField.optional(), description: z.string().max(1000).optional() }).parse(request.body);
  if (input.name) await assertNameFree(input.name, group._id);
  group.set(input);
  await group.save();
  ok(response, toView(group.toObject()));
}));

router.delete("/:id", handle(async (request, response) => {
  const group = await loadViewableGroup(request);
  if (!isSuperAdmin(request.user!) && !isCreator(group, request.user!.id)) throw forbidden("GROUP_ACCESS_DENIED", "Only group creators can delete a group");
  if (await Ticket.exists({ groupId: group._id, deletedAt: null })) throw new HttpError(409, "GROUP_HAS_TICKETS", "Move or delete the group's tickets first");
  group.set({ deletedAt: new Date() });
  await group.save();
  await audit(request, request.user!.id, { action: "GROUP_DELETED", targetType: "Group", targetId: group._id, summary: `Deleted group ${group.name}` });
  ok(response, null);
}));

router.post("/:id/members", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const { userId } = z.object({ userId: objectId }).parse(request.body);
  const user = await User.exists({ _id: userId, isActive: true, deletedAt: null });
  if (!user) throw notFound("USER_NOT_FOUND", "User not found");
  await Group.updateOne({ _id: group._id }, { $addToSet: { memberIds: userId } });
  await audit(request, request.user!.id, { action: "GROUP_MEMBER_ADDED", targetType: "Group", targetId: group._id, summary: `Added a member to ${group.name}`, metadata: { userId } });
  ok(response, { added: true });
}));

router.delete("/:id/members/:userId", handle(async (request, response) => {
  const actor = request.user!;
  const group = await loadViewableGroup(request);
  const userId = objectId.parse(request.params.userId);
  const leavingSelf = userId === actor.id;
  if (!leavingSelf && !canManageGroup(group, actor)) throw forbidden("GROUP_ACCESS_DENIED", "Only group leaders and creators can remove members");
  if (!isMember(group, userId)) throw notFound("NOT_A_MEMBER", "User is not a member of this group");
  if (isCreator(group, userId) && !leavingSelf && !isSuperAdmin(actor) && !isCreator(group, actor.id)) throw forbidden("GROUP_ACCESS_DENIED", "Only a creator can remove another creator");
  if (group.memberIds.length <= 1) throw badRequest("LAST_MEMBER", "A group must have at least one member");
  if (isCreator(group, userId) && group.creatorIds.length <= 1) throw badRequest("LAST_CREATOR", "A group must keep at least one creator");
  await Group.updateOne({ _id: group._id }, { $pull: { memberIds: userId, leaderIds: userId, creatorIds: userId } });
  await audit(request, actor.id, { action: "GROUP_MEMBER_REMOVED", targetType: "Group", targetId: group._id, summary: `Removed a member from ${group.name}`, metadata: { userId } });
  ok(response, { removed: true });
}));

router.patch("/:id/roles/:userId", handle(async (request, response) => {
  const group = await loadViewableGroup(request);
  if (!isSuperAdmin(request.user!) && !isCreator(group, request.user!.id)) throw forbidden("GROUP_ACCESS_DENIED", "Only group creators can change roles");
  const userId = objectId.parse(request.params.userId);
  if (!isMember(group, userId)) throw badRequest("NOT_A_MEMBER", "User must be a group member first");
  const input = z.object({ creator: z.boolean().optional(), leader: z.boolean().optional() }).parse(request.body);
  if (input.creator === false && isCreator(group, userId) && group.creatorIds.length <= 1) throw badRequest("LAST_CREATOR", "A group must keep at least one creator");
  const add: Record<string, string> = {};
  const pull: Record<string, string> = {};
  for (const [role, field] of [["creator", "creatorIds"], ["leader", "leaderIds"]] as const) {
    if (input[role] === true) add[field] = userId;
    if (input[role] === false) pull[field] = userId;
  }
  await Group.updateOne({ _id: group._id }, { ...(Object.keys(add).length ? { $addToSet: add } : {}), ...(Object.keys(pull).length ? { $pull: pull } : {}) });
  await audit(request, request.user!.id, { action: "GROUP_ROLE_CHANGED", targetType: "Group", targetId: group._id, summary: `Changed roles in ${group.name}`, metadata: { userId, ...input } });
  ok(response, { updated: true });
}));

router.post("/:id/topics", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = z.object({ name: nameField, description: z.string().max(500).default("") }).parse(request.body);
  const topic = await Topic.create({ ...input, groupId: group._id });
  ok(response, toView(topic.toObject()), 201);
}));

router.patch("/:id/topics/:topicId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = z.object({ name: nameField.optional(), description: z.string().max(500).optional(), archived: z.boolean().optional() }).parse(request.body);
  const { archived, ...rest } = input;
  const changes = { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) };
  const topic = await Topic.findOneAndUpdate({ _id: objectId.parse(request.params.topicId), groupId: group._id }, changes, { new: true }).lean();
  if (!topic) throw notFound("TOPIC_NOT_FOUND", "Topic not found");
  ok(response, toView(topic));
}));

export { router as groupsRouter };
