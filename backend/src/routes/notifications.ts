import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { Notification } from "../models/index.js";
import { ok } from "../utils/http.js";
const router = Router(); router.use(authenticate);
router.get("/", async (request, response, next) => { try { const notifications = await Notification.find({ userId: request.user!.id }).sort({ createdAt: -1 }).limit(50).lean(); return ok(response, { notifications, unread: notifications.filter((n) => !n.readAt).length }); } catch (e) { next(e); } });
router.patch("/:id/read", async (request, response, next) => { try { await Notification.updateOne({ _id: request.params.id, userId: request.user!.id }, { readAt: new Date() }); return ok(response, null); } catch (e) { next(e); } });
router.post("/read-all", async (request, response, next) => { try { await Notification.updateMany({ userId: request.user!.id, readAt: null }, { readAt: new Date() }); return ok(response, null); } catch (e) { next(e); } });
export { router as notificationsRouter };
