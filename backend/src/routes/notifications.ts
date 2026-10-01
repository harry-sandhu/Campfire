import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { Notification } from "../models/index.js";
import { handle } from "../utils/async-handler.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate);

router.get("/", handle(async (request, response) => {
  const notifications = await Notification.find({ userId: request.user!.id }).sort({ createdAt: -1 }).limit(50).lean();
  const unread = await Notification.countDocuments({ userId: request.user!.id, readAt: null });
  ok(response, { notifications, unread });
}));

router.patch("/:id/read", handle(async (request, response) => {
  await Notification.updateOne({ _id: objectId.parse(request.params.id), userId: request.user!.id }, { readAt: new Date() });
  ok(response, null);
}));

router.post("/read-all", handle(async (request, response) => {
  await Notification.updateMany({ userId: request.user!.id, readAt: null }, { readAt: new Date() });
  ok(response, null);
}));

export { router as notificationsRouter };
