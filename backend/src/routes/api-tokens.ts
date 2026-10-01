import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { API_TOKEN_PREFIX, authenticate, hashApiToken } from "../middleware/auth.js";
import { ApiToken } from "../models/index.js";
import { audit } from "../services/audit.js";
import { handle } from "../utils/async-handler.js";
import { HttpError, notFound } from "../utils/errors.js";
import { ok } from "../utils/http.js";
import { objectId } from "../utils/validation.js";

const router = Router();
router.use(authenticate);

const MAX_ACTIVE_TOKENS = 10;
const view = (t: any) => ({ id: String(t._id), name: t.name, prefix: t.prefix, readOnly: t.readOnly, expiresAt: t.expiresAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt });

router.get("/", handle(async (request, response) => {
  const tokens = await ApiToken.find({ userId: request.user!.id, revokedAt: null }).sort({ createdAt: -1 }).lean();
  ok(response, { tokens: tokens.map(view) });
}));

router.post("/", handle(async (request, response) => {
  const input = z.object({ name: z.string().trim().min(1).max(60), readOnly: z.boolean().default(true), expiresInDays: z.number().int().min(1).max(365).optional() }).parse(request.body);
  if ((await ApiToken.countDocuments({ userId: request.user!.id, revokedAt: null })) >= MAX_ACTIVE_TOKENS) throw new HttpError(409, "TOKEN_LIMIT", `You can have at most ${MAX_ACTIVE_TOKENS} active tokens`);
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const stored = await ApiToken.create({
    userId: request.user!.id,
    name: input.name,
    readOnly: input.readOnly,
    prefix: token.slice(0, 8),
    tokenHash: hashApiToken(token),
    expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : undefined,
  });
  await audit(request, request.user!.id, { action: "API_TOKEN_CREATED", targetType: "ApiToken", targetId: stored._id, summary: `Created API token "${input.name}"`, metadata: { readOnly: input.readOnly } });
  // The plain token is returned exactly once; only its hash is stored.
  ok(response, { ...view(stored), token }, 201);
}));

router.delete("/:id", handle(async (request, response) => {
  const token = await ApiToken.findOneAndUpdate({ _id: objectId.parse(request.params.id), userId: request.user!.id, revokedAt: null }, { revokedAt: new Date() });
  if (!token) throw notFound("TOKEN_NOT_FOUND", "Token not found");
  await audit(request, request.user!.id, { action: "API_TOKEN_REVOKED", targetType: "ApiToken", targetId: token._id, summary: `Revoked API token "${token.name}"` });
  ok(response, null);
}));

export { router as apiTokensRouter };
