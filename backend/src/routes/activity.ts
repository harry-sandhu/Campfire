import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { ActivityLog } from "../models/index.js";
import { ok } from "../utils/http.js";
const router = Router(); router.use(authenticate, requirePermission("activity.view"));
router.get("/", async (request, response, next) => { try { const logs = await ActivityLog.find().populate("actorId", "name email").populate("ticketId", "ticketNumber title").sort({ createdAt: -1 }).limit(100).lean(); return ok(response, { logs }); } catch (e) { next(e); } });
export { router as activityRouter };
