import type { NextFunction, Request, Response } from "express";
import { fail } from "../utils/http.js";

/**
 * Cookie-authenticated endpoints (refresh/logout) reject requests whose Origin header
 * names a site that is not allowed. Non-browser clients send no Origin and are unaffected.
 */
export const requireAllowedOrigin = (allowedOrigins: string[]) => (request: Request, response: Response, next: NextFunction) => {
  const origin = request.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return void fail(response, 403, "CSRF_REJECTED", "Origin not allowed");
  next();
};
