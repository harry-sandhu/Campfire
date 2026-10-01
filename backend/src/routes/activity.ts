import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { ActivityLog, Ticket } from "../models/index.js";
import { isSuperAdmin, ticketVisibilityFilter } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";

const router = Router();
router.use(authenticate, requirePermission("activity.view"));

router.get("/", handle(async (request, response) => {
  const user = request.user!;
  let filter: Record<string, unknown> = {};
  if (!isSuperAdmin(user)) {
    const visible = await Ticket.find({ $and: [{ deletedAt: null }, await ticketVisibilityFilter(user)] }).distinct("_id");
    filter = { ticketId: { $in: visible } };
  }
  const logs = await ActivityLog.find(filter).populate("actorId", "name email").populate("ticketId", "ticketNumber title").sort({ createdAt: -1 }).limit(100).lean();
  ok(response, { logs });
}));

export { router as activityRouter };
