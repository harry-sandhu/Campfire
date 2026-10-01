import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { Milestone, Ticket } from "../models/index.js";
import { loadManageableGroup, loadViewableGroup } from "../services/group-service.js";
import { handle } from "../utils/async-handler.js";
import { notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

/** Mounted at /groups/:id/milestones. */
const router = Router({ mergeParams: true });
router.use(authenticate);

const input = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(""),
  dueDate: z.coerce.date().nullable().optional(),
  closed: z.boolean().optional(),
});

const view = (m: any, progress?: { total: number; done: number }) => ({ id: String(m._id), name: m.name, description: m.description, dueDate: m.dueDate, closedAt: m.closedAt, total: progress?.total ?? 0, done: progress?.done ?? 0 });

router.get("/", handle(async (request, response) => {
  const group = await loadViewableGroup(request);
  const [milestones, counts] = await Promise.all([
    Milestone.find({ groupId: group._id }).sort({ dueDate: 1, createdAt: 1 }).lean(),
    Ticket.aggregate([
      { $match: { groupId: group._id, deletedAt: null, milestoneId: { $ne: null } } },
      { $group: { _id: "$milestoneId", total: { $sum: 1 }, done: { $sum: { $cond: [{ $in: ["$status", ["COMPLETED", "CLOSED"]] }, 1, 0] } } } },
    ]),
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  ok(response, { milestones: milestones.map((m) => view(m, byId.get(String(m._id)))) });
}));

router.post("/", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const { closed: _closed, ...data } = input.parse(request.body);
  const milestone = await Milestone.create({ ...data, groupId: group._id });
  ok(response, view(milestone), 201);
}));

router.patch("/:milestoneId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const { closed, ...data } = input.partial().parse(request.body);
  const changes = { ...data, ...(closed === undefined ? {} : { closedAt: closed ? new Date() : null }) };
  const milestone = await Milestone.findOneAndUpdate({ _id: objectId.parse(request.params.milestoneId), groupId: group._id }, changes, { new: true }).lean();
  if (!milestone) throw notFound("MILESTONE_NOT_FOUND", "Milestone not found");
  ok(response, view(milestone));
}));

router.delete("/:milestoneId", handle(async (request, response) => {
  const group = await loadManageableGroup(request);
  const milestone = await Milestone.findOneAndDelete({ _id: objectId.parse(request.params.milestoneId), groupId: group._id });
  if (!milestone) throw notFound("MILESTONE_NOT_FOUND", "Milestone not found");
  await Ticket.updateMany({ milestoneId: milestone._id }, { milestoneId: null }, { timestamps: false });
  ok(response, null);
}));

export { router as milestonesRouter };
