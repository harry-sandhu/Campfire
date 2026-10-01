import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiToken, User } from "../models/index.js";
import { fail } from "../utils/http.js";
import { verifyAccessToken } from "../utils/security.js";
import type { Permission } from "../constants/permissions.js";

export const API_TOKEN_PREFIX = "cfp_";
export const hashApiToken = (token: string) => createHash("sha256").update(token).digest("hex");

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];
/** Personal API tokens act as their owner but cannot manage sessions, tokens or credentials. */
const TOKEN_FORBIDDEN_PATHS = ["/api/v1/auth", "/api/v1/api-tokens"];

async function userFromToken(token: string, request: Request) {
  if (token.startsWith(API_TOKEN_PREFIX)) {
    const stored = await ApiToken.findOne({ tokenHash: hashApiToken(token), revokedAt: null });
    if (!stored || (stored.expiresAt && stored.expiresAt < new Date())) return { error: "Invalid or expired API token", status: 401 } as const;
    if (TOKEN_FORBIDDEN_PATHS.includes(request.baseUrl)) return { error: "API tokens cannot be used on this endpoint", status: 403 } as const;
    if (stored.readOnly && !SAFE_METHODS.includes(request.method)) return { error: "This API token is read-only", status: 403 } as const;
    if (!stored.lastUsedAt || Date.now() - stored.lastUsedAt.getTime() > 60000) await ApiToken.updateOne({ _id: stored._id }, { lastUsedAt: new Date() });
    return { userId: String(stored.userId) } as const;
  }
  const payload = verifyAccessToken(token);
  if (payload.type !== "access") return { error: "Invalid access token", status: 401 } as const;
  return { userId: payload.sub } as const;
}

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  try {
    const token = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    if (!token) return fail(response, 401, "AUTH_UNAUTHORIZED", "Authentication required");
    const resolved = await userFromToken(token, request);
    if (!("userId" in resolved)) return fail(response, resolved.status, "AUTH_UNAUTHORIZED", resolved.error);
    const user = await User.findOne({ _id: resolved.userId, isActive: true, deletedAt: null }).lean();
    if (!user) return fail(response, 401, "AUTH_UNAUTHORIZED", "User is unavailable");
    request.user = { id: String(user._id), name: user.name, email: user.email, role: user.role, permissions: user.permissions as Permission[], mustChangePassword: user.mustChangePassword };
    if (user.mustChangePassword && request.baseUrl !== "/api/v1/auth") return fail(response, 403, "PASSWORD_CHANGE_REQUIRED", "You must change your temporary password first");
    next();
  } catch { return fail(response, 401, "AUTH_UNAUTHORIZED", "Invalid or expired access token"); }
}

export const requirePermission = (permission: Permission) => (request: Request, response: Response, next: NextFunction) => {
  if (request.user?.role === "SUPERADMIN" || request.user?.permissions.includes(permission)) return next();
  return fail(response, 403, "PERMISSION_DENIED", `Permission required: ${permission}`);
};

export const requireSuperAdmin = (request: Request, response: Response, next: NextFunction) => {
  if (request.user?.role === "SUPERADMIN") return next();
  return fail(response, 403, "PERMISSION_DENIED", "Only a SuperAdmin can do this");
};
