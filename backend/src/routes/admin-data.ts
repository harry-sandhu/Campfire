import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { ActivityLog, AuditLog, Comment, Group, Notification, Ticket, TicketLink, User } from "../models/index.js";
import { audit } from "../services/audit.js";
import { handle } from "../utils/async-handler.js";
import { badRequest, notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { escapeRegex, objectId } from "../utils/validation.js";

/** SuperAdmin tools for finding old data, restoring trash and permanently deleting records. */
const router = Router();
router.use(authenticate, requireSuperAdmin);

const MAX_PURGE = 5000;
const filterSchema = z.object({
  groupId: objectId.optional(),
  ungrouped: z.enum(["true", "false"]).optional(),
  status: z.string().max(20).optional(),
  state: z.enum(["active", "deleted", "any"]).default("any"),
  olderThanDays: z.coerce.number().int().min(0).max(3650).optional(),
  updatedBefore: z.coerce.date().optional(),
  search: z.string().trim().max(100).optional(),
});

function ticketFilter(input: z.infer<typeof filterSchema>) {
  const filter: Record<string, unknown> = {};
  if (input.groupId) filter.groupId = input.groupId;
  if (input.ungrouped === "true") filter.groupId = null;
  if (input.status) filter.status = input.status;
  if (input.state === "active") filter.deletedAt = null;
  if (input.state === "deleted") filter.deletedAt = { $ne: null };
  const cutoff = input.updatedBefore ?? (input.olderThanDays !== undefined ? new Date(Date.now() - input.olderThanDays * 86400000) : undefined);
  if (cutoff) filter.updatedAt = { $lt: cutoff };
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), "i");
    filter.$or = [{ ticketNumber: pattern }, { title: pattern }];
  }
  return filter;
}

router.get("/summary", handle(async (_request, response) => {
  const stats = await mongoose.connection.db!.stats().catch(() => null);
  const [tickets, deletedTickets, comments, activity, notifications, audits, deletedGroups, users] = await Promise.all([
    Ticket.countDocuments({ deletedAt: null }), Ticket.countDocuments({ deletedAt: { $ne: null } }), Comment.countDocuments(), ActivityLog.countDocuments(),
    Notification.countDocuments(), AuditLog.countDocuments(), Group.countDocuments({ deletedAt: { $ne: null } }), User.countDocuments({ deletedAt: null }),
  ]);
  ok(response, { counts: { tickets, deletedTickets, comments, activity, notifications, audit: audits, deletedGroups, users }, storage: stats ? { dataSize: stats.dataSize, storageSize: stats.storageSize } : null });
}));

router.get("/tickets", handle(async (request, response) => {
  const input = filterSchema.extend({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
  const filter = ticketFilter(input);
  const [tickets, total] = await Promise.all([
    Ticket.find(filter).populate("groupId", "name").sort({ updatedAt: 1 }).skip((input.page - 1) * input.limit).limit(input.limit).select("ticketNumber title status groupId updatedAt createdAt deletedAt").lean(),
    Ticket.countDocuments(filter),
  ]);
  ok(response, { tickets: tickets.map((t) => ({ ...t, id: String(t._id), _id: undefined })), total, page: input.page, pages: Math.ceil(total / input.limit) });
}));

const target = z.object({ ids: z.array(objectId).max(MAX_PURGE).optional(), filter: filterSchema.optional() }).refine((v) => v.ids?.length || v.filter, "Provide ids or a filter");
const resolveIds = async (input: z.infer<typeof target>) => (input.ids?.length ? input.ids : (await Ticket.find(ticketFilter(input.filter!)).limit(MAX_PURGE + 1).distinct("_id")).map(String));

router.post("/tickets/purge", handle(async (request, response) => {
  const input = target.and(z.object({ confirm: z.literal("DELETE") })).parse(request.body);
  const ids = await resolveIds(input);
  if (ids.length > MAX_PURGE) throw badRequest("TOO_MANY", `Narrow the filter: at most ${MAX_PURGE} tickets can be deleted at once`);
  if (!ids.length) return void ok(response, { deleted: 0 });
  await Promise.all([
    Comment.deleteMany({ ticketId: { $in: ids } }), TicketLink.deleteMany({ ticketId: { $in: ids } }),
    ActivityLog.deleteMany({ ticketId: { $in: ids } }), Notification.deleteMany({ ticketId: { $in: ids } }),
    Ticket.updateMany({ parentId: { $in: ids } }, { parentId: null }),
    Ticket.updateMany({ "relations.ticketId": { $in: ids } }, { $pull: { relations: { ticketId: { $in: ids } } } }),
  ]);
  const result = await Ticket.deleteMany({ _id: { $in: ids } });
  await audit(request, request.user!.id, { action: "TICKETS_PURGED", targetType: "Ticket", summary: `Permanently deleted ${result.deletedCount} tickets`, metadata: { count: result.deletedCount, filter: input.filter ?? null } });
  ok(response, { deleted: result.deletedCount });
}));

router.post("/tickets/restore", handle(async (request, response) => {
  const input = target.parse(request.body);
  const ids = await resolveIds(input);
  const result = await Ticket.updateMany({ _id: { $in: ids }, deletedAt: { $ne: null } }, { deletedAt: null }, { timestamps: false });
  await audit(request, request.user!.id, { action: "TICKETS_RESTORED", targetType: "Ticket", summary: `Restored ${result.modifiedCount} tickets`, metadata: { count: result.modifiedCount } });
  ok(response, { restored: result.modifiedCount });
}));

router.get("/groups", handle(async (_request, response) => {
  const groups = await Group.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }).lean();
  ok(response, { groups: groups.map((g) => ({ id: String(g._id), name: g.name, deletedAt: g.deletedAt, members: g.memberIds.length })) });
}));

router.post("/groups/:id/restore", handle(async (request, response) => {
  const group = await Group.findOneAndUpdate({ _id: objectId.parse(request.params.id), deletedAt: { $ne: null } }, { deletedAt: null }, { new: true });
  if (!group) throw notFound("GROUP_NOT_FOUND", "Deleted group not found");
  await audit(request, request.user!.id, { action: "GROUP_RESTORED", targetType: "Group", targetId: group._id, summary: `Restored group ${group.name}` });
  ok(response, null);
}));

router.post("/cleanup", handle(async (request, response) => {
  const input = z.object({ target: z.enum(["activity", "notifications", "audit"]), olderThanDays: z.number().int().min(30).max(3650), confirm: z.literal("DELETE") }).parse(request.body);
  const cutoff = new Date(Date.now() - input.olderThanDays * 86400000);
  const model = { activity: ActivityLog, notifications: Notification, audit: AuditLog }[input.target];
  const result = await (model as typeof ActivityLog).deleteMany({ createdAt: { $lt: cutoff } });
  await audit(request, request.user!.id, { action: "DATA_CLEANUP", summary: `Deleted ${result.deletedCount} old ${input.target} records`, metadata: { ...input, deleted: result.deletedCount } });
  ok(response, { deleted: result.deletedCount });
}));

export { router as adminDataRouter };
