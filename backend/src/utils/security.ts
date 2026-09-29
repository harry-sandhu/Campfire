import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/auth.js";

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const createAccessToken = (user: AuthUser) => jwt.sign({ sub: user.id, type: "access" }, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
export const createRefreshToken = (user: AuthUser, tokenId: string) => jwt.sign({ sub: user.id, jti: tokenId, type: "refresh" }, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
export const verifyAccessToken = (token: string) => jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; type: string };
export const verifyRefreshToken = (token: string) => jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; jti: string; type: string };
