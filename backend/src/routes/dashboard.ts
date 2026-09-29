import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Ticket } from "../models/index.js";
import { ok } from "../utils/http.js";

const router = Router(); router.use(authenticate, requirePermission("tickets.view"));
router.get("/", async (request, response, next) => { try { const base: any = { deletedAt: null }; const [counts, mine, recent] = await Promise.all([Ticket.aggregate([{ $match: base }, { $group: { _id: "$status", count: { $sum: 1 } } }]), Ticket.find({ ...base, assigneeId: request.user!.id }).sort({ updatedAt: -1 }).limit(8).lean(), Ticket.find(base).sort({ updatedAt: -1 }).limit(8).lean()]); const byStatus = Object.fromEntries(counts.map((item) => [item._id, item.count])); return ok(response, { counts: { open: byStatus.OPEN || 0, inProgress: byStatus.IN_PROGRESS || 0, completed: byStatus.COMPLETED || 0, overdue: await Ticket.countDocuments({ ...base, dueDate: { $lt: new Date() }, status: { $nin: ["COMPLETED", "CLOSED"] } }) }, mine, recent }); } catch (e) { next(e); } });
export { router as dashboardRouter };
