import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { SavedFilter } from "../models/index.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate);

const MAX_FILTERS = 20;
const ALLOWED_KEYS = ["q", "status", "priority", "group", "milestone", "view", "mine"] as const;
const body = z.object({ name: z.string().trim().min(1).max(60), query: z.record(z.string().max(200)) });

const view = (f: any) => ({ id: String(f._id), name: f.name, query: Object.fromEntries(f.query instanceof Map ? f.query : Object.entries(f.query ?? {})) });

router.get("/", handle(async (request, response) => {
  const filters = await SavedFilter.find({ userId: request.user!.id }).sort({ name: 1 }).lean();
  ok(response, { filters: filters.map(view) });
}));

router.post("/", handle(async (request, response) => {
  const input = body.parse(request.body);
  if ((await SavedFilter.countDocuments({ userId: request.user!.id })) >= MAX_FILTERS) throw new HttpError(409, "FILTER_LIMIT", `You can save at most ${MAX_FILTERS} filters`);
  const query = Object.fromEntries(Object.entries(input.query).filter(([key, value]) => (ALLOWED_KEYS as readonly string[]).includes(key) && value));
  const filter = await SavedFilter.create({ userId: request.user!.id, name: input.name, query });
  ok(response, view(filter), 201);
}));

router.delete("/:id", handle(async (request, response) => {
  const result = await SavedFilter.deleteOne({ _id: objectId.parse(request.params.id), userId: request.user!.id });
  if (!result.deletedCount) throw notFound("FILTER_NOT_FOUND", "Saved filter not found");
  ok(response, null);
}));

export { router as savedFiltersRouter };
