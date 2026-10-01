import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Ticket } from "../models/index.js";
import { ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";

const router = Router();
router.use(authenticate, requirePermission("tickets.view"));

router.get("/", handle(async (request, response) => {
  const user = request.user!;
  const base = { $and: [{ deletedAt: null }, await ticketVisibilityFilter(user)] };
  const mineFilter = { $and: [...base.$and, { $or: [{ assigneeId: user.id }, { assigneeIds: user.id }] }] };
  const [counts, overdue, mine, recent] = await Promise.all([
    Ticket.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Ticket.countDocuments({ $and: [...base.$and, { dueDate: { $lt: new Date() }, status: { $nin: ["COMPLETED", "CLOSED"] } }] }),
    Ticket.find(mineFilter).sort({ updatedAt: -1 }).limit(8).lean(),
    Ticket.find(base).sort({ updatedAt: -1 }).limit(8).lean(),
  ]);
  const byStatus = Object.fromEntries(counts.map((item) => [item._id, item.count]));
  ok(response, {
    counts: { open: byStatus.OPEN || 0, inProgress: byStatus.IN_PROGRESS || 0, inReview: byStatus.IN_REVIEW || 0, blocked: byStatus.BLOCKED || 0, completed: byStatus.COMPLETED || 0, overdue },
    mine,
    recent,
  });
}));

export { router as dashboardRouter };
