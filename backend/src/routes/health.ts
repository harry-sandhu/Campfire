import { Router } from "express";
import mongoose from "mongoose";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json({ success: true, status: "ok" });
});

healthRouter.get("/ready", (_request, response) => {
  const ready = mongoose.connection.readyState === 1;
  response.status(ready ? 200 : 503).json({ success: ready, status: ready ? "ready" : "not_ready" });
});
