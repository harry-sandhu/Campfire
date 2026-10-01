import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Ticket } from "../models/index.js";
import { withCommentCounts } from "../services/ticket-service.js";
import { ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";

const router = Router();
router.use(authenticate, requirePermission("tickets.view"));

const toView = (ticket: any) => ({ ...ticket, id: String(ticket._id), _id: undefined });
const populate = (query: any) => query.populate("assigneeId assigneeIds", "name email").populate("groupId", "name").populate("topicIds", "name");
const OPEN = { status: { $nin: ["COMPLETED", "CLOSED"] } };
const DAY = 86400000;

router.get("/", handle(async (request, response) => {
  const user = request.user!;
  const base = [{ deletedAt: null }, await ticketVisibilityFilter(user)];
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * DAY);
  const mine = { $or: [{ assigneeId: user.id }, { assigneeIds: user.id }] };
  const list = async (extra: object[], sort: Record<string, 1 | -1>) => (await withCommentCounts(await populate(Ticket.find({ $and: [...base, ...extra] }).collation({ locale: "en", numericOrdering: true }).sort(sort).limit(8)).lean())).map(toView);

  const [counts, overdueCount, overdue, dueSoon, assigned, recent] = await Promise.all([
    Ticket.aggregate([{ $match: { $and: base } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Ticket.countDocuments({ $and: [...base, OPEN, { dueDate: { $lt: now } }] }),
    list([OPEN, { dueDate: { $lt: now } }], { dueDate: 1 }),
    list([OPEN, { dueDate: { $gte: now, $lte: weekAhead } }], { dueDate: 1 }),
    list([mine, OPEN], { ticketNumber: 1 }),
    list([], { updatedAt: -1 }),
  ]);
  const byStatus = Object.fromEntries(counts.map((item) => [item._id, item.count]));
  ok(response, {
    counts: { open: byStatus.OPEN || 0, inProgress: byStatus.IN_PROGRESS || 0, inReview: byStatus.IN_REVIEW || 0, blocked: byStatus.BLOCKED || 0, completed: byStatus.COMPLETED || 0, overdue: overdueCount },
    overdue, dueSoon, mine: assigned, recent,
  });
}));

export { router as dashboardRouter };
