import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { ActivityLog, Comment, Ticket, TicketLink } from "../models/index.js";
import { hasPermission, loadVisibleTicket, ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { forbidden, notFound, unprocessable } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { escapeRegex, objectId, unique } from "../utils/validation.js";
import { nextTicketNumber, notify, recordActivity, validatePlacement } from "../services/ticket-service.js";
import { audit } from "../services/audit.js";

const router = Router();
router.use(authenticate);

const statuses = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CLOSED"] as const;
const priorities = ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const createInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000).default(""),
  priority: z.enum(priorities).default("MEDIUM"),
  assigneeId: objectId.nullable().optional(),
  assigneeIds: z.array(objectId).max(50).default([]),
  dueDate: z.coerce.date().nullable().optional(),
  groupId: objectId.nullable().optional(),
  topicIds: z.array(objectId).max(50).default([]),
});

const updateInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000),
  priority: z.enum(priorities),
  status: z.enum(statuses),
  assigneeId: objectId.nullable(),
  assigneeIds: z.array(objectId).max(50),
  dueDate: z.coerce.date().nullable(),
  groupId: objectId.nullable(),
  topicIds: z.array(objectId).max(50),
}).partial();

/** Which permission each editable field needs. SuperAdmin bypasses all of them. */
const fieldPermission: Record<string, string> = {
  title: "tickets.edit",
  description: "tickets.edit",
  dueDate: "tickets.edit",
  groupId: "tickets.edit",
  topicIds: "tickets.edit",
  status: "tickets.change_status",
  priority: "tickets.change_priority",
  assigneeId: "tickets.assign",
  assigneeIds: "tickets.assign",
};

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  groupId: objectId.optional(),
  topicId: objectId.optional(),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  assigneeId: objectId.optional(),
  mine: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const toView = (ticket: any) => ({ ...ticket, id: String(ticket._id), _id: undefined });
const populateTicket = (query: any) =>
  query
    .populate("assigneeId assigneeIds createdById updatedById", "name email")
    .populate("groupId", "name")
    .populate("topicIds", "name archivedAt");

router.get("/", requirePermission("tickets.view"), handle(async (request, response) => {
  const q = listQuery.parse(request.query);
  const user = request.user!;
  const and: Record<string, unknown>[] = [{ deletedAt: null }, await ticketVisibilityFilter(user)];
  if (q.groupId) and.push({ groupId: q.groupId });
  if (q.topicId) and.push({ topicIds: q.topicId });
  if (q.status) and.push({ status: q.status });
  if (q.priority) and.push({ priority: q.priority });
  if (q.assigneeId) and.push({ $or: [{ assigneeId: q.assigneeId }, { assigneeIds: q.assigneeId }] });
  if (q.mine === "true") and.push({ $or: [{ assigneeId: user.id }, { assigneeIds: user.id }] });
  if (q.search) {
    const pattern = new RegExp(escapeRegex(q.search), "i");
    and.push({ $or: [{ ticketNumber: pattern }, { title: pattern }, { description: pattern }] });
  }
  const filter = { $and: and };
  const [tickets, total] = await Promise.all([
    populateTicket(Ticket.find(filter).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit)).lean(),
    Ticket.countDocuments(filter),
  ]);
  ok(response, { tickets: tickets.map(toView), page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) });
}));

router.post("/", requirePermission("tickets.create"), handle(async (request, response) => {
  const input = createInput.parse(request.body);
  const user = request.user!;
  const assigneeIds = unique([...input.assigneeIds, ...(input.assigneeId ? [input.assigneeId] : [])]);
  if (assigneeIds.length && !hasPermission(user, "tickets.assign")) throw forbidden("PERMISSION_DENIED", "Assigning tickets requires tickets.assign");
  await validatePlacement(user, input.groupId ?? null, input.topicIds, assigneeIds);

  const ticket = await Ticket.create({
    title: input.title,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate ?? undefined,
    groupId: input.groupId ?? null,
    topicIds: unique(input.topicIds),
    assigneeId: assigneeIds[0] ?? null,
    assigneeIds,
    ticketNumber: await nextTicketNumber(),
    createdById: user.id,
    updatedById: user.id,
  });
  await recordActivity(ticket._id, user.id, "CREATED", { assigneeIds });
  await notify(assigneeIds, ticket._id, "TICKET_ASSIGNED", `You were assigned ${ticket.ticketNumber}`, user.id);
  ok(response, toView(ticket.toObject()), 201);
}));

router.get("/:id", requirePermission("tickets.view"), handle(async (request, response) => {
  const user = request.user!;
  const visible = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const ticket = await populateTicket(Ticket.findById(visible._id)).lean();
  const [comments, links, activities] = await Promise.all([
    hasPermission(user, "comments.view") ? Comment.find({ ticketId: visible._id, deletedAt: null }).populate("authorId", "name email").sort({ createdAt: 1 }).lean() : [],
    hasPermission(user, "ticket_links.view") ? TicketLink.find({ ticketId: visible._id }).sort({ createdAt: -1 }).lean() : [],
    ActivityLog.find({ ticketId: visible._id }).populate("actorId", "name email").sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  ok(response, { ticket: toView(ticket), comments, links, activities });
}));

router.patch("/:id", handle(async (request, response) => {
  const user = request.user!;
  const input = updateInput.parse(request.body);
  const fields = Object.keys(input) as (keyof typeof input)[];
  if (!fields.length) throw unprocessable("NO_CHANGES", "No editable fields were provided");
  const missing = fields.find((field) => !hasPermission(user, fieldPermission[field]));
  if (missing) throw forbidden("PERMISSION_DENIED", `Changing ${missing} requires ${fieldPermission[missing]}`);

  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const before = ticket.toObject();

  const touchesPlacement = "groupId" in input || "topicIds" in input || "assigneeIds" in input || "assigneeId" in input;
  const groupId = "groupId" in input ? input.groupId ?? null : ticket.groupId ? String(ticket.groupId) : null;
  const groupChanged = String(groupId ?? "") !== String(ticket.groupId ?? "");
  const topicIds = input.topicIds ?? (groupChanged ? [] : (ticket.topicIds ?? []).map(String));
  const requestedAssignees = "assigneeIds" in input || "assigneeId" in input
    ? unique([...(input.assigneeIds ?? []), ...(input.assigneeId ? [input.assigneeId] : [])])
    : unique([...(ticket.assigneeIds ?? []).map(String), ...(ticket.assigneeId ? [String(ticket.assigneeId)] : [])]);
  if (touchesPlacement) await validatePlacement(user, groupId, topicIds, requestedAssignees);

  const changes: Record<string, unknown> = {};
  for (const key of ["title", "description", "priority", "status", "dueDate"] as const) if (key in input) changes[key] = input[key];
  if ("groupId" in input) changes.groupId = groupId;
  if ("topicIds" in input || groupChanged) changes.topicIds = unique(topicIds);
  if ("assigneeIds" in input || "assigneeId" in input) {
    changes.assigneeIds = requestedAssignees;
    changes.assigneeId = requestedAssignees[0] ?? null;
  }
  if (input.status === "COMPLETED" || input.status === "CLOSED") changes.completedAt = ticket.completedAt ?? new Date();
  else if (input.status) changes.completedAt = null;

  const activityKeys = Object.keys(changes).filter((key) => key !== "assigneeId" && key !== "completedAt");
  ticket.set({ ...changes, updatedById: user.id });
  await ticket.save();

  for (const key of activityKeys) {
    const from = (before as any)[key];
    const to = (changes as any)[key];
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) await recordActivity(ticket._id, user.id, `${key.toUpperCase()}_CHANGED`, { from, to });
  }
  if (changes.assigneeIds) {
    const previous = (before.assigneeIds ?? []).map(String);
    await notify(requestedAssignees.filter((id) => !previous.includes(id)), ticket._id, "TICKET_ASSIGNED", `You were assigned ${ticket.ticketNumber}`, user.id);
  }
  ok(response, toView(ticket.toObject()));
}));

router.delete("/:id", requirePermission("tickets.delete"), handle(async (request, response) => {
  const user = request.user!;
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  ticket.set({ deletedAt: new Date(), updatedById: user.id });
  await ticket.save();
  await recordActivity(ticket._id, user.id, "DELETED");
  await audit(request, user.id, { action: "TICKET_DELETED", targetType: "Ticket", targetId: ticket._id, summary: `Deleted ${ticket.ticketNumber}` });
  ok(response, null);
}));

const commentBody = z.object({ body: z.string().trim().min(1).max(10000) });

router.post("/:id/comments", requirePermission("comments.create"), handle(async (request, response) => {
  const user = request.user!;
  const { body } = commentBody.parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const comment = await Comment.create({ ticketId: ticket._id, authorId: user.id, body });
  await recordActivity(ticket._id, user.id, "COMMENT_ADDED");
  await notify([...(ticket.assigneeIds ?? []).map(String), String(ticket.assigneeId ?? "")], ticket._id, "TICKET_COMMENTED", `${ticket.ticketNumber} received a comment`, user.id);
  ok(response, comment, 201);
}));

/** Comments can be changed by their author; SuperAdmin may moderate any comment. */
async function findOwnComment(request: any, ticketId: string) {
  const user = request.user!;
  const ticket = await loadVisibleTicket(ticketId, user);
  const filter: Record<string, unknown> = { _id: objectId.parse(request.params.commentId), ticketId: ticket._id, deletedAt: null };
  if (user.role !== "SUPERADMIN") filter.authorId = user.id;
  return { ticket, filter };
}

router.patch("/:id/comments/:commentId", requirePermission("comments.edit"), handle(async (request, response) => {
  const { body } = commentBody.parse(request.body);
  const { ticket, filter } = await findOwnComment(request, objectId.parse(request.params.id));
  const comment = await Comment.findOneAndUpdate(filter, { body }, { new: true });
  if (!comment) throw notFound("COMMENT_NOT_FOUND", "Comment not found");
  await recordActivity(ticket._id, request.user!.id, "COMMENT_EDITED");
  ok(response, comment);
}));

router.delete("/:id/comments/:commentId", requirePermission("comments.delete"), handle(async (request, response) => {
  const { ticket, filter } = await findOwnComment(request, objectId.parse(request.params.id));
  const comment = await Comment.findOneAndUpdate(filter, { deletedAt: new Date() });
  if (!comment) throw notFound("COMMENT_NOT_FOUND", "Comment not found");
  await recordActivity(ticket._id, request.user!.id, "COMMENT_DELETED");
  ok(response, null);
}));

const safeUrl = z.string().url().max(2048).refine((value) => /^https?:\/\//i.test(value), "Only HTTP(S) URLs are allowed");
const linkInput = z.object({ label: z.string().trim().min(1).max(120), url: safeUrl });

router.post("/:id/links", requirePermission("ticket_links.create"), handle(async (request, response) => {
  const user = request.user!;
  const input = linkInput.parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const link = await TicketLink.create({ ...input, ticketId: ticket._id, createdById: user.id });
  await recordActivity(ticket._id, user.id, "LINK_ADDED", { label: input.label });
  ok(response, link, 201);
}));

router.patch("/:id/links/:linkId", requirePermission("ticket_links.edit"), handle(async (request, response) => {
  const input = linkInput.partial().parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  const link = await TicketLink.findOneAndUpdate({ _id: objectId.parse(request.params.linkId), ticketId: ticket._id }, input, { new: true });
  if (!link) throw notFound("LINK_NOT_FOUND", "Link not found");
  ok(response, link);
}));

router.delete("/:id/links/:linkId", requirePermission("ticket_links.delete"), handle(async (request, response) => {
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  const link = await TicketLink.findOneAndDelete({ _id: objectId.parse(request.params.linkId), ticketId: ticket._id });
  if (!link) throw notFound("LINK_NOT_FOUND", "Link not found");
  ok(response, null);
}));

export { router as ticketsRouter };
