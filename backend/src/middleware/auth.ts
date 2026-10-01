import type { NextFunction, Request, Response } from "express";
import { User } from "../models/index.js";
import { fail } from "../utils/http.js";
import { verifyAccessToken } from "../utils/security.js";
import type { Permission } from "../constants/permissions.js";

export async function authenticate(request: Request, response: Response, next: NextFunction) {
  try {
    const bearer = request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : undefined;
    const token = bearer;
    if (!token) return fail(response, 401, "AUTH_UNAUTHORIZED", "Authentication required");
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") return fail(response, 401, "AUTH_UNAUTHORIZED", "Invalid access token");
    const user = await User.findOne({ _id: payload.sub, isActive: true, deletedAt: null }).lean();
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

export const requireUser = (request: Request, response: Response) => {
  if (!request.user) { fail(response, 401, "AUTH_UNAUTHORIZED", "Authentication required"); return false; }
  return true;
};
