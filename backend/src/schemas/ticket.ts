import { z } from "zod";
import { objectId } from "../utils/validation.js";

export const statuses = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "COMPLETED", "CLOSED"] as const;
export const priorities = ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000).default(""),
  priority: z.enum(priorities).default("MEDIUM"),
  assigneeId: objectId.nullable().optional(),
  assigneeIds: z.array(objectId).max(50).default([]),
  dueDate: z.coerce.date().nullable().optional(),
  groupId: objectId.nullable().optional(),
  topicIds: z.array(objectId).max(50).default([]),
  milestoneId: objectId.nullable().optional(),
  parentId: objectId.nullable().optional(),
});
export type CreateInput = z.infer<typeof createInput>;

export const updateInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(50000),
  priority: z.enum(priorities),
  status: z.enum(statuses),
  assigneeId: objectId.nullable(),
  assigneeIds: z.array(objectId).max(50),
  dueDate: z.coerce.date().nullable(),
  groupId: objectId.nullable(),
  topicIds: z.array(objectId).max(50),
  milestoneId: objectId.nullable(),
  parentId: objectId.nullable(),
}).partial();
export type UpdateInput = z.infer<typeof updateInput>;

/** Which permission each editable field needs. SuperAdmin bypasses all of them. */
export const fieldPermission: Record<string, string> = {
  title: "tickets.edit", description: "tickets.edit", dueDate: "tickets.edit", groupId: "tickets.edit", topicIds: "tickets.edit",
  milestoneId: "tickets.edit", parentId: "tickets.edit",
  status: "tickets.change_status", priority: "tickets.change_priority",
  assigneeId: "tickets.assign", assigneeIds: "tickets.assign",
};

/** A filter value that may hold several options separated by commas (`status=OPEN,BLOCKED`). One value still works. */
const pick = <T extends string>(allowed: readonly T[]) =>
  z.string().max(200).optional().transform((v, ctx) => {
    const items = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (items.some((x) => !(allowed as readonly string[]).includes(x))) { ctx.addIssue({ code: "custom", message: `Choose from ${allowed.join(", ")}` }); return z.NEVER; }
    return items.length ? ([...new Set(items)] as T[]) : undefined;
  });
const ids = z.string().max(600).optional().transform((v, ctx) => {
  const items = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const parsed = items.map((x) => objectId.safeParse(x));
  if (parsed.some((r) => !r.success)) { ctx.addIssue({ code: "custom", message: "Invalid id" }); return z.NEVER; }
  return items.length ? [...new Set(items)] : undefined;
});
/** `statusNot=true` flips the filter to "everything except these". */
const flag = z.enum(["true", "false"]).optional();

export const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  groupId: z.union([objectId, z.literal("none")]).optional(),
  topicId: objectId.optional(),
  milestoneId: ids,
  milestoneNot: flag,
  status: pick(statuses),
  statusNot: flag,
  priority: pick(priorities),
  priorityNot: flag,
  assigneeId: ids,
  assigneeNot: flag,
  mine: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListQuery = z.infer<typeof listQuery>;
