import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS, isPermission } from "../constants/permissions.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { User } from "../models/index.js";
import { fail, ok } from "../utils/http.js";
import { hashPassword } from "../utils/security.js";

const router = Router();
router.use(authenticate);
const userInput = z.object({ name: z.string().min(1).max(120), email: z.string().email(), temporaryPassword: z.string().min(8).max(128), permissions: z.array(z.string()).default([]) });
const output = (u: any) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, permissions: u.permissions, isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt });
router.get("/assignees", requirePermission("tickets.assign"), async (_request, response, next) => { try { const users = await User.find({ deletedAt: null, isActive: true }).sort({ name: 1 }).lean(); return ok(response, { users: users.map(output) }); } catch (e) { next(e); } });
router.get("/", requirePermission("users.view"), async (_request, response, next) => { try { const users = await User.find({ deletedAt: null }).sort({ name: 1 }).lean(); return ok(response, { users: users.map(output), permissions: PERMISSIONS }); } catch (e) { next(e); } });
router.post("/", requirePermission("users.create"), async (request, response, next) => { try { const input = userInput.parse(request.body); if (input.permissions.some((p) => !isPermission(p))) return fail(response, 422, "INVALID_PERMISSION", "Unknown permission"); const exists = await User.exists({ email: input.email.toLowerCase() }); if (exists) return fail(response, 409, "EMAIL_IN_USE", "Email is already in use"); const user = await User.create({ name: input.name, email: input.email.toLowerCase(), passwordHash: await hashPassword(input.temporaryPassword), permissions: input.permissions, mustChangePassword: true }); return ok(response, output(user), 201); } catch (e) { next(e); } });
router.patch("/:id", requirePermission("users.edit"), async (request, response, next) => { try { const input = z.object({ name: z.string().min(1).max(120).optional(), permissions: z.array(z.string()).optional() }).parse(request.body); if (input.permissions?.some((p) => !isPermission(p))) return fail(response, 422, "INVALID_PERMISSION", "Unknown permission"); const user = await User.findOneAndUpdate({ _id: request.params.id, deletedAt: null, role: "USER" }, input, { new: true }); return user ? ok(response, output(user)) : fail(response, 404, "USER_NOT_FOUND", "User not found"); } catch (e) { next(e); } });
router.patch("/:id/status", requirePermission("users.disable"), async (request, response, next) => { try { const active = z.object({ isActive: z.boolean() }).parse(request.body).isActive; const user = await User.findOneAndUpdate({ _id: request.params.id, role: "USER", deletedAt: null }, { isActive: active }, { new: true }); return user ? ok(response, output(user)) : fail(response, 404, "USER_NOT_FOUND", "User not found"); } catch (e) { next(e); } });
router.post("/:id/reset-password", requirePermission("users.edit"), async (request, response, next) => { try { const password = z.object({ temporaryPassword: z.string().min(8).max(128) }).parse(request.body).temporaryPassword; const user = await User.findOne({ _id: request.params.id, role: "USER", deletedAt: null }); if (!user) return fail(response, 404, "USER_NOT_FOUND", "User not found"); user.passwordHash = await hashPassword(password); user.mustChangePassword = true; await user.save(); return ok(response, null); } catch (e) { next(e); } });
export { router as usersRouter };
