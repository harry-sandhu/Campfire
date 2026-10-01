import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { RefreshToken, User } from "../models/index.js";
import { handle } from "../utils/async-handler.js";
import { badRequest } from "../utils/errors.js";
import { fail, ok } from "../utils/http.js";
import { createAccessToken, createRefreshToken, hashPassword, verifyPassword, verifyRefreshToken } from "../utils/security.js";

const router = Router();
const credentials = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });
const REFRESH_DAYS = 7;
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
  domain: env.COOKIE_DOMAIN || undefined,
  path: "/",
};

/** Compared against when the email is unknown so response time does not reveal which emails exist. */
const dummyHash = await hashPassword(randomUUID());

const publicUser = (user: any) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions, mustChangePassword: user.mustChangePassword });
const sessionUser = (user: any) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions });

async function issueSession(user: any, response: Response) {
  const tokenId = randomUUID();
  const refresh = createRefreshToken(sessionUser(user), tokenId);
  await RefreshToken.deleteMany({ userId: user._id, expiresAt: { $lt: new Date() } });
  await RefreshToken.create({ userId: user._id, tokenId, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000) });
  response.cookie("refreshToken", refresh, { ...cookieOptions, maxAge: REFRESH_DAYS * 86400000 });
  return createAccessToken(sessionUser(user));
}

router.post("/login", handle(async (request, response) => {
  const input = credentials.parse(request.body);
  const user = await User.findOne({ email: input.email.toLowerCase(), deletedAt: null });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !user.isActive || !valid) return void fail(response, 401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password");
  user.lastLoginAt = new Date();
  await user.save();
  const accessToken = await issueSession(user, response);
  ok(response, { user: publicUser(user), accessToken });
}));

router.post("/refresh", async (request, response) => {
  const invalid = () => fail(response, 401, "AUTH_UNAUTHORIZED", "Refresh token is invalid");
  try {
    const raw = request.cookies?.refreshToken;
    if (!raw) return void fail(response, 401, "AUTH_UNAUTHORIZED", "Refresh token required");
    const payload = verifyRefreshToken(raw);
    const stored = await RefreshToken.findOne({ tokenId: payload.jti, userId: payload.sub });
    if (!stored) return void invalid();
    if (stored.revokedAt) {
      // A rotated token was presented again: treat the whole session family as stolen.
      await RefreshToken.updateMany({ userId: stored.userId, revokedAt: null }, { revokedAt: new Date() });
      return void invalid();
    }
    const user = await User.findOne({ _id: payload.sub, isActive: true, deletedAt: null });
    if (!user || stored.expiresAt < new Date()) return void invalid();
    stored.revokedAt = new Date();
    await stored.save();
    const accessToken = await issueSession(user, response);
    ok(response, { user: publicUser(user), accessToken });
  } catch {
    invalid();
  }
});

router.post("/logout", async (request, response) => {
  const raw = request.cookies?.refreshToken;
  if (raw) {
    try {
      const payload = verifyRefreshToken(raw);
      await RefreshToken.updateOne({ tokenId: payload.jti }, { revokedAt: new Date() });
    } catch {
      /* token is already invalid */
    }
  }
  response.clearCookie("refreshToken", cookieOptions);
  ok(response, null);
});

router.get("/me", authenticate, handle(async (request, response) => {
  const user = await User.findById(request.user!.id).lean();
  ok(response, { user: publicUser(user) });
}));

router.post("/change-password", authenticate, handle(async (request, response) => {
  const input = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128) }).parse(request.body);
  const user = await User.findById(request.user!.id);
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) return void fail(response, 400, "AUTH_INVALID_PASSWORD", "Current password is incorrect");
  if (input.currentPassword === input.newPassword) throw badRequest("PASSWORD_UNCHANGED", "Choose a password different from the current one");
  user.passwordHash = await hashPassword(input.newPassword);
  user.mustChangePassword = false;
  await user.save();
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  const accessToken = await issueSession(user, response);
  ok(response, { accessToken });
}));

export { router as authRouter };
