import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

const app = createApp();

if (env.NODE_ENV !== "test") {
  await connectDatabase();
  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`Campfire API listening on port ${env.PORT}`);
  });
}

export { app };
