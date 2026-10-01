import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { User } from "../models/index.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, badRequest, forbidden } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { hashPassword } from "../utils/security.js";

const router = Router();

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Creates the first SuperAdmin from INITIAL_SUPERADMIN_* environment variables.
 * If BOOTSTRAP_TOKEN is set, callers must send it in the x-bootstrap-token header.
 */
router.post("/", handle(async (request, response) => {
  const token = process.env.BOOTSTRAP_TOKEN;
  if (token && !sameSecret(request.get("x-bootstrap-token") ?? "", token)) throw forbidden("BOOTSTRAP_FORBIDDEN", "Invalid bootstrap token");

  const input = z.object({
    email: z.string().email().optional(),
    password: z.string().min(12).optional(),
    name: z.string().min(1).max(120).default("SuperAdmin"),
  }).parse({ email: process.env.INITIAL_SUPERADMIN_EMAIL, password: process.env.INITIAL_SUPERADMIN_PASSWORD, name: process.env.INITIAL_SUPERADMIN_NAME });

  if (await User.exists({ role: "SUPERADMIN", deletedAt: null })) throw new HttpError(409, "BOOTSTRAP_ALREADY_COMPLETE", "A SuperAdmin already exists");
  if (!input.email || !input.password) throw badRequest("BOOTSTRAP_CONFIG_MISSING", "Initial SuperAdmin environment variables are required");

  // The unique email index makes a concurrent second request fail instead of creating a duplicate.
  const user = await User.create({ name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), role: "SUPERADMIN", permissions: [] });
  ok(response, { id: user._id, email: user.email }, 201);
}));

export { router as bootstrapRouter };
