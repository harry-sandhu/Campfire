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

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp());
  app.use("/api/v1/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), authRouter);
  app.use("/api/v1/bootstrap", rateLimit({ windowMs: 60 * 60 * 1000, limit: 5 }), bootstrapRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/tickets", ticketsRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/activity", activityRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/docs", docsRouter);

  app.use("/health", healthRouter);
  app.use((_request, response) => {
    response.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}
