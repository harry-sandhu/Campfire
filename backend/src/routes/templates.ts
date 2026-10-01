import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { Group, TicketTemplate } from "../models/index.js";
import { createInput, priorities } from "../schemas/ticket.js";
import { addInterval, type Every } from "../services/recurrence.js";
import { createTicket, validatePlacement } from "../services/ticket-service.js";
import { canManageGroup, hasPermission, isSuperAdmin } from "../utils/access.js";
import { handle } from "../utils/async-handler.js";
import { forbidden, notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { memberGroupIds } from "../utils/access.js";
import { objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate, requirePermission("tickets.create"));

const every = z.enum(["daily", "weekly", "monthly"]);
const body = z.object({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000).default(""),
  priority: z.enum(priorities).default("MEDIUM"),
  groupId: objectId.nullable().optional(),
  topicIds: z.array(objectId).max(50).default([]),
  assigneeIds: z.array(objectId).max(50).default([]),
  recurrence: z.object({ every, startAt: z.coerce.date().optional() }).nullable().optional(),
});

const view = (t: any) => ({
  id: String(t._id), name: t.name, title: t.title, description: t.description, priority: t.priority, groupId: t.groupId ? String(t.groupId) : null,
  topicIds: (t.topicIds ?? []).map(String), assigneeIds: (t.assigneeIds ?? []).map(String), createdById: String(t.createdById),
  recurrence: t.recurrence?.every ? { every: t.recurrence.every, nextRunAt: t.recurrence.nextRunAt, active: !!t.recurrence.active } : null,
});

async function loadTemplate(request: any, mustManage: boolean) {
  const user = request.user;
  const template = await TicketTemplate.findById(objectId.parse(request.params.id));
  if (!template) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
  if (template.groupId) {
    const group = await Group.findOne({ _id: template.groupId, deletedAt: null });
    const visible = !!group && (isSuperAdmin(user) || group.memberIds.some((m) => String(m) === user.id));
    if (!visible) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
    if (mustManage && !(String(template.createdById) === user.id || canManageGroup(group, user))) throw forbidden("TEMPLATE_ACCESS_DENIED", "Only the template's creator or a group manager can change it");
  } else if (!isSuperAdmin(user) && String(template.createdById) !== user.id) throw notFound("TEMPLATE_NOT_FOUND", "Template not found");
  return template;
}

router.get("/", handle(async (request, response) => {
  const user = request.user!;
  const filter = isSuperAdmin(user) ? {} : { $or: [{ groupId: { $in: await memberGroupIds(user.id) } }, { groupId: null, createdById: user.id }] };
  const templates = await TicketTemplate.find(filter).sort({ name: 1 }).lean();
  ok(response, { templates: templates.map(view) });
}));

router.post("/", handle(async (request, response) => {
  const user = request.user!;
  const input = body.parse(request.body);
  if (input.assigneeIds.length && !hasPermission(user, "tickets.assign")) throw forbidden("PERMISSION_DENIED", "Assigning tickets requires tickets.assign");
  await validatePlacement(user, input.groupId ?? null, input.topicIds, input.assigneeIds);
  const { recurrence, ...data } = input;
  const template = await TicketTemplate.create({
    ...data, groupId: input.groupId ?? null, createdById: user.id,
    ...(recurrence ? { recurrence: { every: recurrence.every, active: true, nextRunAt: recurrence.startAt ?? addInterval(new Date(), recurrence.every as Every) } } : {}),
  });
  ok(response, view(template), 201);
}));

router.patch("/:id", handle(async (request, response) => {
  const template = await loadTemplate(request, true);
  const input = body.pick({ name: true, title: true, description: true, priority: true }).partial().extend({ active: z.boolean().optional(), every: every.optional() }).parse(request.body);
  const { active, every: interval, ...rest } = input;
  template.set(rest);
  if (template.recurrence?.every) {
    if (active !== undefined) template.set("recurrence.active", active);
    if (interval) { template.set("recurrence.every", interval); template.set("recurrence.nextRunAt", addInterval(new Date(), interval)); }
  }
  await template.save();
  ok(response, view(template));
}));

router.delete("/:id", handle(async (request, response) => {
  const template = await loadTemplate(request, true);
  await template.deleteOne();
  ok(response, null);
}));

router.post("/:id/create", handle(async (request, response) => {
  const template = await loadTemplate(request, false);
  const ticket = await createTicket(request.user!, createInput.parse({
    title: template.title, description: template.description, priority: template.priority,
    groupId: template.groupId ? String(template.groupId) : null,
    topicIds: (template.topicIds ?? []).map(String),
    assigneeIds: hasPermission(request.user!, "tickets.assign") ? (template.assigneeIds ?? []).map(String) : [],
  }));
  ok(response, { id: String(ticket._id), ticketNumber: ticket.ticketNumber }, 201);
}));

export { router as templatesRouter };
