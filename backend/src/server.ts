import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { runDueRecurrences } from "./services/recurrence.js";
import { startWebhookDispatcher } from "./services/webhooks.js";

const app = createApp();

if (env.NODE_ENV !== "test") {
  await connectDatabase();
  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Campfire API listening on port ${env.PORT}`);
  });

  startWebhookDispatcher();

  // Recurring tickets: check on start (catches up after the host slept) and then every 5 minutes.
  const tick = () => runDueRecurrences().catch((error) => console.error("Recurring tickets failed", error));
  void tick();
  const recurrence = setInterval(tick, 5 * 60 * 1000);
  recurrence.unref();

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export { app };
