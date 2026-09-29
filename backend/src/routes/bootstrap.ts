import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { User } from "../models/index.js";
import { hashPassword } from "../utils/security.js";
import { ok } from "../utils/http.js";

const router = Router();
router.post("/", async (_request, response, next) => { try { const input = z.object({ email: z.string().email().optional(), password: z.string().min(12).optional(), name: z.string().min(1).max(120).default("SuperAdmin") }).parse({ email: process.env.INITIAL_SUPERADMIN_EMAIL, password: process.env.INITIAL_SUPERADMIN_PASSWORD, name: process.env.INITIAL_SUPERADMIN_NAME }); const exists = await User.exists({ role: "SUPERADMIN", deletedAt: null }); if (exists) return response.status(409).json({ success: false, error: { code: "BOOTSTRAP_ALREADY_COMPLETE", message: "A SuperAdmin already exists" } }); if (!input.email || !input.password) return response.status(400).json({ success: false, error: { code: "BOOTSTRAP_CONFIG_MISSING", message: "Initial SuperAdmin environment variables are required" } }); const user = await User.create({ name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.password), role: "SUPERADMIN", permissions: [] }); return ok(response, { id: user._id, email: user.email }, 201); } catch (e) { next(e); } });
export { router as bootstrapRouter };
