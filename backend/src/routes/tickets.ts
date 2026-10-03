import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { ActivityLog, Comment, Ticket, TicketLink } from "../models/index.js";
import { createInput, listQuery, statuses, priorities, updateInput } from "../schemas/ticket.js";
import { audit } from "../services/audit.js";
import { publish } from "../services/events.js";
import { buildTicketFilter, createTicket, filterViewers, interestedUsers, notify, recordActivity, restoreRecentlyDeleted, softDeleteTicket, updateTicket, withCommentCounts } from "../services/ticket-service.js";
import { hasPermission, loadVisibleTicket, ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { toCsv } from "../utils/csv.js";
import { HttpError, notFound, unprocessable } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId, unique } from "../utils/validation.js";

const router = Router();
router.use(authenticate);

const toView = (ticket: any) => ({ ...ticket, id: String(ticket._id), _id: undefined });
const populateTicket = (query: any) =>
  query
    .populate("assigneeId assigneeIds createdById updatedById", "name email")
    .populate("groupId", "name")
    .populate("milestoneId", "name dueDate")
    .populate("topicIds", "name archivedAt");

const COMMENT_PAGE = 30;
const ACTIVITY_PAGE = 20;

/* ---------- list, export, bulk, import (declared before /:id) ---------- */

router.get("/", requirePermission("tickets.view"), handle(async (request, response) => {
  const q = listQuery.parse(request.query);
  const filter = await buildTicketFilter(request.user!, q);
  const [tickets, total] = await Promise.all([
    // Lower ticket numbers first; numeric collation so TKT-2 sorts before TKT-10.
    populateTicket(Ticket.find(filter).collation({ locale: "en", numericOrdering: true }).sort({ ticketNumber: 1 }).skip((q.page - 1) * q.limit).limit(q.limit)).lean(),
    Ticket.countDocuments(filter),
  ]);
  ok(response, { tickets: (await withCommentCounts(tickets)).map(toView), page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) });
}));

router.get("/export", requirePermission("tickets.view"), handle(async (request, response) => {
  const q = listQuery.omit({ page: true, limit: true }).parse(request.query);
  const filter = await buildTicketFilter(request.user!, q);
  const tickets: any[] = await populateTicket(Ticket.find(filter).sort({ createdAt: 1 }).limit(5000)).lean();
  const names = (list?: { name: string }[]) => (list ?? []).map((x) => x.name).join("; ");
  const csv = toCsv(
    ["Number", "Title", "Description", "Status", "Priority", "Group", "Topics", "Assignees", "Due date", "Created", "Updated", "Created by"],
    tickets.map((t) => [t.ticketNumber, t.title, t.description, t.status, t.priority, t.groupId?.name ?? "", names(t.topicIds), names(t.assigneeIds), t.dueDate?.toISOString().slice(0, 10) ?? "", t.createdAt.toISOString(), t.updatedAt.toISOString(), t.createdById?.name ?? ""]),
  );
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="tickets.csv"');
  response.send(csv);
}));

const bulkInput = z.object({
  ids: z.array(objectId).min(1).max(100),
  action: z.enum(["status", "priority", "assign", "unassign", "move", "milestone", "delete"]),
  value: z.string().nullable().optional(),
});

router.post("/bulk", handle(async (request, response) => {
  const { ids, action, value } = bulkInput.parse(request.body);
  const user = request.user!;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of unique(ids)) {
    try {
      const ticket = await loadVisibleTicket(id, user);
      if (action === "delete") await softDeleteTicket(user, ticket);
      else {
        const assignees = [...(ticket.assigneeIds ?? []).map(String), ...(ticket.assigneeId ? [String(ticket.assigneeId)] : [])];
        const patch = {
          status: () => ({ status: z.enum(statuses).parse(value) }),
          priority: () => ({ priority: z.enum(priorities).parse(value) }),
          assign: () => ({ assigneeIds: unique([...assignees, objectId.parse(value)]) }),
          unassign: () => ({ assigneeIds: assignees.filter((a) => a !== objectId.parse(value)) }),
          move: () => ({ groupId: value ? objectId.parse(value) : null }),
          milestone: () => ({ milestoneId: value ? objectId.parse(value) : null }),
        }[action]();
        await updateTicket(user, ticket, patch);
      }
      results.push({ id, ok: true });
    } catch (error) {
      results.push({ id, ok: false, error: error instanceof HttpError ? error.message : error instanceof z.ZodError ? "Invalid value" : "Failed" });
    }
  }
  if (action === "delete") await audit(request, user.id, { action: "TICKETS_BULK_DELETED", targetType: "Ticket", summary: `Bulk deleted ${results.filter((r) => r.ok).length} tickets` });
  ok(response, { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
}));

router.post("/restore", requirePermission("tickets.delete"), handle(async (request, response) => {
  const { ids } = z.object({ ids: z.array(objectId).min(1).max(100) }).parse(request.body);
  let restored = 0;
  for (const id of unique(ids)) {
    try { await restoreRecentlyDeleted(request.user!, id); restored++; } catch { /* skip tickets that cannot be restored */ }
  }
  if (restored) await audit(request, request.user!.id, { action: "TICKETS_RESTORED", targetType: "Ticket", summary: `Restored ${restored} tickets (undo)`, metadata: { count: restored } });
  ok(response, { restored });
}));

const importRow = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000).default(""),
  priority: z.enum(priorities).default("MEDIUM"),
  status: z.enum(statuses).default("OPEN"),
  dueDate: z.coerce.date().nullable().optional(),
});

router.post("/import", requirePermission("tickets.create"), handle(async (request, response) => {
  const input = z.object({ groupId: objectId.nullable().optional(), rows: z.array(z.unknown()).min(1).max(200) }).parse(request.body);
  const user = request.user!;
  const canStatus = hasPermission(user, "tickets.change_status");
  const errors: { row: number; error: string }[] = [];
  let created = 0;
  for (const [index, raw] of input.rows.entries()) {
    const parsed = importRow.safeParse(raw);
    if (!parsed.success) { errors.push({ row: index + 1, error: parsed.error.issues[0]?.message ?? "Invalid row" }); continue; }
    try {
      const ticket = await createTicket(user, createInput.parse({ ...parsed.data, groupId: input.groupId ?? null }));
      if (canStatus && parsed.data.status !== "OPEN") await updateTicket(user, ticket, { status: parsed.data.status });
      created++;
    } catch (error) {
      errors.push({ row: index + 1, error: error instanceof HttpError ? error.message : "Failed" });
    }
  }
  ok(response, { created, errors }, created ? 201 : 200);
}));

/* ---------- create / read / update / delete ---------- */

router.post("/", requirePermission("tickets.create"), handle(async (request, response) => {
  const ticket = await createTicket(request.user!, createInput.parse(request.body));
  ok(response, toView(ticket.toObject()), 201);
}));

const miniTickets = (tickets: any[]) => tickets.map((t) => ({ id: String(t._id), ticketNumber: t.ticketNumber, title: t.title, status: t.status }));

router.get("/:id", requirePermission("tickets.view"), handle(async (request, response) => {
  const user = request.user!;
  const visible = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const visibility = await ticketVisibilityFilter(user);
  const ticket: any = await populateTicket(Ticket.findById(visible._id)).lean();
  const relatedIds = (ticket.relations ?? []).map((r: any) => r.ticketId);

  const [commentRows, links, activityRows, subtasks, parent, outgoing, incoming] = await Promise.all([
    hasPermission(user, "comments.view") ? Comment.find({ ticketId: visible._id, deletedAt: null }).populate("authorId", "name email").sort({ _id: -1 }).limit(COMMENT_PAGE + 1).lean() : [],
    hasPermission(user, "ticket_links.view") ? TicketLink.find({ ticketId: visible._id }).sort({ createdAt: -1 }).lean() : [],
    ActivityLog.find({ ticketId: visible._id }).populate("actorId", "name email").sort({ _id: -1 }).limit(ACTIVITY_PAGE + 1).lean(),
    Ticket.find({ $and: [{ parentId: visible._id, deletedAt: null }, visibility] }).sort({ createdAt: 1 }).select("ticketNumber title status").lean(),
    ticket.parentId ? Ticket.findOne({ $and: [{ _id: ticket.parentId, deletedAt: null }, visibility] }).select("ticketNumber title status").lean() : null,
    relatedIds.length ? Ticket.find({ $and: [{ _id: { $in: relatedIds }, deletedAt: null }, visibility] }).select("ticketNumber title status").lean() : [],
    Ticket.find({ $and: [{ "relations.ticketId": visible._id, deletedAt: null }, visibility] }).select("ticketNumber title status relations").lean(),
  ]);

  const outgoingById = new Map(outgoing.map((t) => [String(t._id), t]));
  const relations = [
    ...(ticket.relations ?? []).filter((r: any) => outgoingById.has(String(r.ticketId))).map((r: any) => ({ type: r.type === "BLOCKS" ? "blocks" : "relates", ...miniTickets([outgoingById.get(String(r.ticketId))])[0] })),
    ...incoming.map((t: any) => ({ type: t.relations.find((r: any) => String(r.ticketId) === String(visible._id))?.type === "BLOCKS" ? "blockedBy" : "relates", ...miniTickets([t])[0] })),
  ];

  const hasMoreComments = commentRows.length > COMMENT_PAGE;
  ok(response, {
    ticket: toView(ticket),
    comments: commentRows.slice(0, COMMENT_PAGE).reverse(),
    hasMoreComments,
    links,
    activities: activityRows.slice(0, ACTIVITY_PAGE),
    hasMoreActivity: activityRows.length > ACTIVITY_PAGE,
    subtasks: miniTickets(subtasks),
    parent: parent ? miniTickets([parent])[0] : null,
    relations,
    watching: (ticket.watcherIds ?? []).some((id: unknown) => String(id) === user.id),
  });
}));

router.get("/:id/comments", requirePermission("comments.view"), handle(async (request, response) => {
  const q = z.object({ before: objectId.optional() }).parse(request.query);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  const rows = await Comment.find({ ticketId: ticket._id, deletedAt: null, ...(q.before ? { _id: { $lt: q.before } } : {}) }).populate("authorId", "name email").sort({ _id: -1 }).limit(COMMENT_PAGE + 1).lean();
  ok(response, { comments: rows.slice(0, COMMENT_PAGE).reverse(), hasMore: rows.length > COMMENT_PAGE });
}));

router.get("/:id/activity", handle(async (request, response) => {
  const q = z.object({ before: objectId.optional() }).parse(request.query);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  const rows = await ActivityLog.find({ ticketId: ticket._id, ...(q.before ? { _id: { $lt: q.before } } : {}) }).populate("actorId", "name email").sort({ _id: -1 }).limit(ACTIVITY_PAGE + 1).lean();
  ok(response, { activities: rows.slice(0, ACTIVITY_PAGE), hasMore: rows.length > ACTIVITY_PAGE });
}));

router.patch("/:id", handle(async (request, response) => {
  const user = request.user!;
  const input = updateInput.parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  await updateTicket(user, ticket, input);
  ok(response, toView(ticket.toObject()));
}));

router.delete("/:id", requirePermission("tickets.delete"), handle(async (request, response) => {
  const user = request.user!;
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  await softDeleteTicket(user, ticket);
  await audit(request, user.id, { action: "TICKET_DELETED", targetType: "Ticket", targetId: ticket._id, summary: `Deleted ${ticket.ticketNumber}` });
  ok(response, null);
}));

/* ---------- watchers ---------- */

router.post("/:id/watch", requirePermission("tickets.view"), handle(async (request, response) => {
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  await Ticket.updateOne({ _id: ticket._id }, { $addToSet: { watcherIds: request.user!.id } }, { timestamps: false });
  ok(response, { watching: true });
}));

router.delete("/:id/watch", requirePermission("tickets.view"), handle(async (request, response) => {
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  await Ticket.updateOne({ _id: ticket._id }, { $pull: { watcherIds: request.user!.id } }, { timestamps: false });
  ok(response, { watching: false });
}));

/* ---------- relations ---------- */

router.post("/:id/relations", requirePermission("tickets.edit"), handle(async (request, response) => {
  const input = z.object({ type: z.enum(["BLOCKS", "RELATES"]), ticketId: objectId }).parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  if (input.ticketId === String(ticket._id)) throw unprocessable("INVALID_RELATION", "A ticket cannot relate to itself");
  const target = await loadVisibleTicket(input.ticketId, request.user!);
  const exists = (ticket.relations ?? []).some((r) => String(r.ticketId) === input.ticketId) || (target.relations ?? []).some((r) => String(r.ticketId) === String(ticket._id));
  if (exists) throw new HttpError(409, "RELATION_EXISTS", "These tickets are already related");
  await Ticket.updateOne({ _id: ticket._id }, { $push: { relations: { type: input.type, ticketId: target._id } } }, { timestamps: false });
  await recordActivity(ticket._id, request.user!.id, "RELATION_ADDED", { type: input.type, target: target.ticketNumber });
  publish({ type: "ticket.updated", ticketId: String(ticket._id), groupId: ticket.groupId ? String(ticket.groupId) : null, data: { changed: ["relations"] } });
  ok(response, null, 201);
}));

router.delete("/:id/relations/:targetId", requirePermission("tickets.edit"), handle(async (request, response) => {
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), request.user!);
  const targetId = objectId.parse(request.params.targetId);
  const target = await loadVisibleTicket(targetId, request.user!);
  await Ticket.updateOne({ _id: ticket._id }, { $pull: { relations: { ticketId: target._id } } }, { timestamps: false });
  await Ticket.updateOne({ _id: target._id }, { $pull: { relations: { ticketId: ticket._id } } }, { timestamps: false });
  await recordActivity(ticket._id, request.user!.id, "RELATION_REMOVED", { target: target.ticketNumber });
  ok(response, null);
}));

/* ---------- comments ---------- */

const commentBody = z.object({ body: z.string().trim().min(1).max(10000), mentionIds: z.array(objectId).max(10).default([]) });

router.post("/:id/comments", requirePermission("comments.create"), handle(async (request, response) => {
  const user = request.user!;
  const input = commentBody.parse(request.body);
  const ticket = await loadVisibleTicket(objectId.parse(request.params.id), user);
  const mentions = (await filterViewers(ticket, input.mentionIds)).filter((id) => id !== user.id);
  const comment = await Comment.create({ ticketId: ticket._id, authorId: user.id, body: input.body, mentionIds: mentions });
  await recordActivity(ticket._id, user.id, "COMMENT_ADDED");
  await notify(mentions, ticket._id, "TICKET_MENTION", `${user.name} mentioned you on ${ticket.ticketNumber}`, user.id);
  await notify(interestedUsers(ticket).filter((id) => !mentions.includes(id)), ticket._id, "TICKET_COMMENTED", `${ticket.ticketNumber} received a comment`, user.id);
  publish({ type: "comment.created", ticketId: String(ticket._id), groupId: ticket.groupId ? String(ticket.groupId) : null, data: { ticketNumber: ticket.ticketNumber, title: ticket.title, author: user.name, body: input.body } });
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
  const { body } = commentBody.pick({ body: true }).parse(request.body);
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

/* ---------- links ---------- */

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
