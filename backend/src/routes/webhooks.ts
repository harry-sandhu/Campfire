import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { Webhook, WebhookDelivery } from "../models/index.js";
import { audit } from "../services/audit.js";
import { loadManageableGroup } from "../services/group-service.js";
import { WEBHOOK_EVENTS, assertAllowedWebhookUrl, deliverWebhook } from "../services/webhooks.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, notFound, unprocessable } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

/** Mounted at /groups/:id/webhooks. Only group leaders, creators and SuperAdmin may manage them. */
const router = Router({ mergeParams: true });
router.use(authenticate);

const MAX_PER_GROUP = 10;
const events = z.array(z.enum(WEBHOOK_EVENTS)).min(1);
const view = (h: any) => ({ id: String(h._id), url: h.url, format: h.format, events: h.events, active: h.active, lastStatus: h.lastStatus ?? null, lastDeliveredAt: h.lastDeliveredAt ?? null, failures: h.failures ?? 0 });
const deliveryView = (d: any) => ({ id: String(d._id), event: d.event, ticketId: d.ticketId ?? null, status: d.status, ok: d.ok, durationMs: d.durationMs, error: d.error ?? null, createdAt: d.createdAt });

async function checkUrl(url: string) {
  try { await assertAllowedWebhookUrl(url); } catch (error) { throw unprocessable("INVALID_WEBHOOK_URL", (error as Error).message); }
}

router.get("/", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const hooks = await Webhook.find({ groupId: group._id }).sort({ createdAt: 1 }).lean();
  ok(response, { webhooks: hooks.map(view), events: WEBHOOK_EVENTS });
}));

router.post("/", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = z.object({ url: z.string().url().max(2048), format: z.enum(["json", "slack"]).default("json"), events: events.default([...WEBHOOK_EVENTS]) }).parse(request.body);
  await checkUrl(input.url);
  if ((await Webhook.countDocuments({ groupId: group._id })) >= MAX_PER_GROUP) throw new HttpError(409, "WEBHOOK_LIMIT", `A group can have at most ${MAX_PER_GROUP} webhooks`);
  const secret = randomBytes(24).toString("hex");
  const hook = await Webhook.create({ ...input, groupId: group._id, createdById: request.user!.id, secret });
  await audit(request, request.user!.id, { action: "WEBHOOK_CREATED", targetType: "Group", targetId: group._id, summary: `Added a webhook to ${group.name}` });
  // The signing secret is shown once, at creation.
  ok(response, { ...view(hook), secret }, 201);
}));

router.patch("/:webhookId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = z.object({ active: z.boolean().optional(), events: events.optional(), url: z.string().url().max(2048).optional(), format: z.enum(["json", "slack"]).optional() }).parse(request.body);
  if (input.url) await checkUrl(input.url);
  // Turning a paused webhook back on gives it a clean slate.
  const hook = await Webhook.findOneAndUpdate({ _id: objectId.parse(request.params.webhookId), groupId: group._id }, { ...input, ...(input.active ? { failures: 0 } : {}) }, { new: true }).lean();
  if (!hook) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  ok(response, view(hook));
}));

router.delete("/:webhookId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const hook = await Webhook.findOneAndDelete({ _id: objectId.parse(request.params.webhookId), groupId: group._id });
  if (!hook) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  await audit(request, request.user!.id, { action: "WEBHOOK_DELETED", targetType: "Group", targetId: group._id, summary: `Removed a webhook from ${group.name}` });
  ok(response, null);
}));

router.post("/:webhookId/test", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const hook = await Webhook.findOne({ _id: objectId.parse(request.params.webhookId), groupId: group._id });
  if (!hook) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  await checkUrl(hook.url);
  const status = await deliverWebhook(hook, "ticket.updated", String(group._id), undefined, { ticketNumber: "TEST-1", title: "Test delivery from Campfire", changed: ["ping"] });
  ok(response, { status, delivered: status >= 200 && status < 300 });
}));

router.post("/:webhookId/rotate-secret", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const secret = randomBytes(24).toString("hex");
  const hook = await Webhook.findOneAndUpdate({ _id: objectId.parse(request.params.webhookId), groupId: group._id }, { secret }, { new: true }).lean();
  if (!hook) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  await audit(request, request.user!.id, { action: "WEBHOOK_SECRET_ROTATED", targetType: "Group", targetId: group._id, summary: `Rotated a webhook secret in ${group.name}` });
  ok(response, { ...view(hook), secret });
}));

router.get("/:webhookId/deliveries", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const webhookId = objectId.parse(request.params.webhookId);
  if (!(await Webhook.exists({ _id: webhookId, groupId: group._id }))) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  const deliveries = await WebhookDelivery.find({ webhookId }).sort({ createdAt: -1 }).limit(50).lean();
  ok(response, { deliveries: deliveries.map(deliveryView) });
}));

router.post("/:webhookId/deliveries/:deliveryId/resend", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const hook = await Webhook.findOne({ _id: objectId.parse(request.params.webhookId), groupId: group._id });
  if (!hook) throw notFound("WEBHOOK_NOT_FOUND", "Webhook not found");
  const delivery = await WebhookDelivery.findOne({ _id: objectId.parse(request.params.deliveryId), webhookId: hook._id }).lean();
  if (!delivery) throw notFound("DELIVERY_NOT_FOUND", "Delivery not found");
  await checkUrl(hook.url);
  const status = await deliverWebhook(hook, delivery.event, String(group._id), delivery.ticketId ?? undefined, (delivery.data ?? {}) as Record<string, unknown>);
  ok(response, { status, delivered: status >= 200 && status < 300 });
}));

export { router as webhooksRouter };
