import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Ticket } from "../models/index.js";
import { ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { canSeePerson, peopleSummary, personDetail } from "../services/people-report.js";
import { notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate, requirePermission("tickets.view"));

router.get("/", handle(async (request, response) => {
  const q = z.object({ groupId: objectId.optional(), days: z.coerce.number().int().min(7).max(365).default(90) }).parse(request.query);
  const since = new Date(Date.now() - q.days * 86400000);
  const base = { $and: [{ deletedAt: null }, await ticketVisibilityFilter(request.user!), ...(q.groupId ? [{ groupId: q.groupId }] : [])] };
  const weeks = 12;
  const weekStart = new Date(Date.now() - weeks * 7 * 86400000);
  const open = { status: { $nin: ["COMPLETED", "CLOSED"] } };

  const [byStatus, byPriority, byAssignee, byGroup, created, completed, lead, overdue] = await Promise.all([
    Ticket.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: { $and: [...base.$and, open] } }, { $group: { _id: "$priority", count: { $sum: 1 } } }]),
    Ticket.aggregate([
      { $match: { $and: [...base.$and, open] } }, { $unwind: "$assigneeIds" }, { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 10 }, { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $project: { count: 1, name: { $arrayElemAt: ["$user.name", 0] } } },
    ]),
    Ticket.aggregate([
      { $match: { $and: [...base.$and, open] } }, { $group: { _id: "$groupId", count: { $sum: 1 } } },
      { $lookup: { from: "groups", localField: "_id", foreignField: "_id", as: "group" } }, { $project: { count: 1, name: { $ifNull: [{ $arrayElemAt: ["$group.name", 0] }, "No group"] } } }, { $sort: { count: -1 } },
    ]),
    Ticket.aggregate([{ $match: { $and: [...base.$and, { createdAt: { $gte: weekStart } }] } }, { $group: { _id: { $dateToString: { format: "%G-W%V", date: "$createdAt" } }, count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: { $and: [...base.$and, { completedAt: { $gte: weekStart } }] } }, { $group: { _id: { $dateToString: { format: "%G-W%V", date: "$completedAt" } }, count: { $sum: 1 } } }]),
    Ticket.aggregate([
      { $match: { $and: [...base.$and, { completedAt: { $gte: since } }] } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ["$completedAt", "$createdAt"] } }, count: { $sum: 1 } } },
    ]),
    Ticket.countDocuments({ $and: [...base.$and, open, { dueDate: { $lt: new Date() } }] }),
  ]);

  // Build a continuous 12-week series so empty weeks show as zero.
  const key = (d: Date) => {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };
  const createdBy = new Map(created.map((c) => [c._id, c.count]));
  const completedBy = new Map(completed.map((c) => [c._id, c.count]));
  const series = Array.from({ length: weeks }, (_, i) => {
    const week = key(new Date(Date.now() - (weeks - 1 - i) * 7 * 86400000));
    return { week, created: createdBy.get(week) ?? 0, completed: completedBy.get(week) ?? 0 };
  });

  ok(response, {
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    byPriority: Object.fromEntries(byPriority.map((s) => [s._id, s.count])),
    byAssignee: byAssignee.map((a) => ({ name: a.name ?? "Unknown", count: a.count })),
    byGroup: byGroup.map((g) => ({ name: g.name, count: g.count })),
    series,
    overdue,
    avgLeadTimeDays: lead[0] ? Math.round((lead[0].avgMs / 86400000) * 10) / 10 : null,
    completedInRange: lead[0]?.count ?? 0,
    days: q.days,
  });
}));

/** Who was given what, and did they finish it. People see themselves; leaders see their groups; SuperAdmin sees everyone. */
router.get("/people", handle(async (request, response) => {
  ok(response, { people: await peopleSummary(request.user!) });
}));

router.get("/people/:userId", handle(async (request, response) => {
  const userId = objectId.parse(request.params.userId);
  const q = z.object({ groupId: z.union([objectId, z.literal("none")]).optional(), status: z.string().max(20).optional(), days: z.coerce.number().int().min(1).max(730).optional() }).parse(request.query);
  if (!(await canSeePerson(request.user!, userId))) throw notFound("PERSON_NOT_FOUND", "Person not found");
  const detail = await personDetail(request.user!, userId, q);
  if (!detail.user) throw notFound("PERSON_NOT_FOUND", "Person not found");
  ok(response, detail);
}));

export { router as reportsRouter };
