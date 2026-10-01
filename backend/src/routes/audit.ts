import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { AuditLog } from "../models/index.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";
import { escapeRegex, objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate, requirePermission("audit.view"));

router.get("/", handle(async (request, response) => {
  const q = z.object({
    action: z.string().max(60).optional(),
    actorId: objectId.optional(),
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }).parse(request.query);
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = q.action;
  if (q.actorId) filter.actorId = q.actorId;
  if (q.search) filter.summary = new RegExp(escapeRegex(q.search), "i");
  const [entries, total, actions] = await Promise.all([
    AuditLog.find(filter).populate("actorId", "name email").sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AuditLog.countDocuments(filter),
    AuditLog.distinct("action"),
  ]);
  ok(response, { entries, total, page: q.page, pages: Math.ceil(total / q.limit), actions: actions.sort() });
}));

export { router as auditRouter };
