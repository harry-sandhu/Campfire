import { randomUUID } from "node:crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { bootstrapRouter } from "./routes/bootstrap.js";
import { usersRouter } from "./routes/users.js";
import { ticketsRouter } from "./routes/tickets.js";
import { notificationsRouter } from "./routes/notifications.js";
import { activityRouter } from "./routes/activity.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { docsRouter } from "./routes/docs.js";
import { groupsRouter } from "./routes/groups.js";
import { auditRouter } from "./routes/audit.js";
import { adminDataRouter } from "./routes/admin-data.js";
import { apiTokensRouter } from "./routes/api-tokens.js";
import { milestonesRouter } from "./routes/milestones.js";
import { savedFiltersRouter } from "./routes/saved-filters.js";
import { searchRouter } from "./routes/search.js";
import { reportsRouter } from "./routes/reports.js";
import { templatesRouter } from "./routes/templates.js";
import { eventsRouter } from "./routes/events.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { buildAllowedOrigins, normalizeOrigin, reportRejectedOrigin } from "./config/origins.js";
import { requireAllowedOrigin } from "./middleware/csrf.js";

export function createApp() {
  const app = express();
  const allowedOrigins = buildAllowedOrigins(env.FRONTEND_URL, env.CORS_ORIGINS);
  const isAllowedOrigin = (origin: string) => allowedOrigins.has(normalizeOrigin(origin));

  app.disable("x-powered-by");
  // Render and similar hosts put one proxy in front of the app; without this every client shares one IP for rate limiting.
  if (env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      const ok = !origin || isAllowedOrigin(origin);
      if (!ok) reportRejectedOrigin(origin!, allowedOrigins);
      callback(null, ok);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({
    level: env.NODE_ENV === "test" ? "silent" : "info",
    // Honour an upstream request id so one request can be traced across proxy and API logs.
    genReqId: (request, response) => {
      const id = String(request.headers["x-request-id"] ?? randomUUID());
      response.setHeader("x-request-id", id);
      return id;
    },
    // Never write credentials to the logs.
    redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]', "req.headers['x-bootstrap-token']"],
  }));
  app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), requireAllowedOrigin(isAllowedOrigin), authRouter);
  app.use("/api/v1/bootstrap", rateLimit({ windowMs: 60 * 60 * 1000, limit: 5 }), bootstrapRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/groups/:id/milestones", milestonesRouter);
  app.use("/api/v1/groups/:id/webhooks", webhooksRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/groups", groupsRouter);
  app.use("/api/v1/templates", templatesRouter);
  app.use("/api/v1/saved-filters", savedFiltersRouter);
  app.use("/api/v1/search", searchRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/api-tokens", apiTokensRouter);
  app.use("/api/v1/audit", auditRouter);
  app.use("/api/v1/admin/data", adminDataRouter);
  app.use("/api/v1/tickets", ticketsRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/activity", activityRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/health", healthRouter);
  app.use("/api/docs", docsRouter);

  app.get("/", (_request, response) => {
    response.json({ success: true, message: "Server is working" });
  });
  app.use("/health", healthRouter);
  app.use((_request, response) => {
    response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}
