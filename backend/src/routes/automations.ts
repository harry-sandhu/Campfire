import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { Automation, AutomationRun, Milestone, Ticket, Topic } from "../models/index.js";
import { audit } from "../services/audit.js";
import { MAX_ACTIONS, MAX_AUTOMATIONS_PER_GROUP, actionSchema, conditionSchema, describeAction, matchesConditions, missingActionField, triggerSchema, type Action, type Condition } from "../services/automations.js";
import { loadManageableGroup } from "../services/group-service.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, notFound, unprocessable } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

/** Mounted at /groups/:id/automations. Only group leaders, creators and SuperAdmin may see or change them. */
const router = Router({ mergeParams: true });
router.use(authenticate);

const body = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(5).default([]),
  actions: z.array(actionSchema).min(1).max(MAX_ACTIONS),
});

const view = (a: any) => ({ id: String(a._id), name: a.name, active: a.active, trigger: a.trigger, conditions: a.conditions ?? [], actions: a.actions ?? [], lastRunAt: a.lastRunAt ?? null, runCount: a.runCount ?? 0, failCount: a.failCount ?? 0 });

/** Rules may only point at people, milestones and topics of their own group. */
async function checkReferences(group: any, input: { actions: Action[]; conditions: Condition[]; trigger: { type: string } }) {
  const members = group.memberIds.map(String);
  for (const action of input.actions) {
    const missing = missingActionField(action);
    if (missing) throw unprocessable("INVALID_AUTOMATION", `${describeAction(action)} needs a value for “${missing}”`);
    if (action.userId && !members.includes(action.userId)) throw unprocessable("INVALID_AUTOMATION", "People in an automation must be members of the group");
    if (action.milestoneId && !(await Milestone.exists({ _id: action.milestoneId, groupId: group._id }))) throw unprocessable("INVALID_AUTOMATION", "Milestone must belong to this group");
  }
  for (const condition of input.conditions) {
    if (condition.field === "assignee" && condition.value !== "nobody" && !members.includes(condition.value)) throw unprocessable("INVALID_AUTOMATION", "Assignee conditions must name a group member or “nobody”");
    if (condition.field === "topic" && !(await Topic.exists({ _id: condition.value, groupId: group._id }))) throw unprocessable("INVALID_AUTOMATION", "Topic must belong to this group");
  }
  if (input.actions.some((a) => a.type === "close_milestone") && input.trigger.type !== "milestone.completed" && input.trigger.type !== "ticket.status_changed") {
    // Closing a ticket's milestone only makes sense when the ticket changes; keep rules honest.
    throw unprocessable("INVALID_AUTOMATION", "“Close the milestone” works with the status-changed or milestone-completed triggers");
  }
}

router.get("/", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const automations = await Automation.find({ groupId: group._id }).sort({ createdAt: 1 }).lean();
  ok(response, { automations: automations.map(view), limit: MAX_AUTOMATIONS_PER_GROUP });
}));

router.post("/", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = body.parse(request.body);
  await checkReferences(group, input);
  if ((await Automation.countDocuments({ groupId: group._id })) >= MAX_AUTOMATIONS_PER_GROUP) throw new HttpError(409, "AUTOMATION_LIMIT", `A group can have at most ${MAX_AUTOMATIONS_PER_GROUP} automations`);
  const automation = await Automation.create({ ...input, groupId: group._id, createdById: request.user!.id });
  await audit(request, request.user!.id, { action: "AUTOMATION_CREATED", targetType: "Group", targetId: group._id, summary: `Added the automation “${input.name}” to ${group.name}` });
  ok(response, view(automation), 201);
}));

router.patch("/:automationId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const input = body.partial().parse(request.body);
  const current = await Automation.findOne({ _id: objectId.parse(request.params.automationId), groupId: group._id });
  if (!current) throw notFound("AUTOMATION_NOT_FOUND", "Automation not found");
  const merged = { trigger: input.trigger ?? current.trigger, conditions: input.conditions ?? current.conditions, actions: input.actions ?? current.actions } as { trigger: { type: string }; conditions: Condition[]; actions: Action[] };
  if (input.trigger || input.conditions || input.actions) await checkReferences(group, merged);
  current.set(input);
  await current.save();
  ok(response, view(current));
}));

router.delete("/:automationId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const automation = await Automation.findOneAndDelete({ _id: objectId.parse(request.params.automationId), groupId: group._id });
  if (!automation) throw notFound("AUTOMATION_NOT_FOUND", "Automation not found");
  await audit(request, request.user!.id, { action: "AUTOMATION_DELETED", targetType: "Group", targetId: group._id, summary: `Removed the automation “${automation.name}” from ${group.name}` });
  ok(response, null);
}));

router.get("/:automationId/runs", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const automationId = objectId.parse(request.params.automationId);
  if (!(await Automation.exists({ _id: automationId, groupId: group._id }))) throw notFound("AUTOMATION_NOT_FOUND", "Automation not found");
  const runs = await AutomationRun.find({ automationId }).sort({ createdAt: -1 }).limit(30).lean();
  const tickets = await Ticket.find({ _id: { $in: runs.map((r) => r.ticketId).filter(Boolean) } }).select("ticketNumber").lean();
  const numbers = new Map(tickets.map((t) => [String(t._id), t.ticketNumber]));
  ok(response, { runs: runs.map((r) => ({ id: String(r._id), ok: r.ok, error: r.error ?? null, ticketId: r.ticketId ? String(r.ticketId) : null, ticketNumber: r.ticketId ? numbers.get(String(r.ticketId)) ?? null : null, createdAt: r.createdAt })) });
}));

/** Dry run: says whether the rule's conditions fit a ticket and what it would do. Changes nothing. */
router.post("/:automationId/test", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const { ticketId } = z.object({ ticketId: objectId }).parse(request.body);
  const automation = await Automation.findOne({ _id: objectId.parse(request.params.automationId), groupId: group._id }).lean();
  if (!automation) throw notFound("AUTOMATION_NOT_FOUND", "Automation not found");
  const ticket = await Ticket.findOne({ _id: ticketId, groupId: group._id, deletedAt: null });
  if (!ticket) throw notFound("TICKET_NOT_FOUND", "Ticket not found in this group");
  const matches = matchesConditions((automation.conditions ?? []) as Condition[], ticket);
  ok(response, { matches, steps: matches ? (automation.actions as Action[]).map(describeAction) : [] });
}));

export { router as automationsRouter };
