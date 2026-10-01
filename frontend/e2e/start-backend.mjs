// Starts a throwaway in-memory MongoDB and the real API against it, for the browser tests.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, "../../backend");
const require = createRequire(path.join(backend, "package.json"));
const { MongoMemoryServer } = require("mongodb-memory-server");

const mongo = await MongoMemoryServer.create();
const child = spawn("npx", ["tsx", "src/server.ts"], {
  cwd: backend,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: "4100",
    MONGODB_URI: mongo.getUri("e2e"),
    JWT_ACCESS_SECRET: "e2e-access-secret-e2e-access-secret",
    JWT_REFRESH_SECRET: "e2e-refresh-secret-e2e-refresh-secret",
    FRONTEND_URL: "http://localhost:3100",
    INITIAL_SUPERADMIN_EMAIL: "admin@example.com",
    INITIAL_SUPERADMIN_PASSWORD: "admin-password-123",
    INITIAL_SUPERADMIN_NAME: "Admin Person",
  },
});

const stop = async () => { child.kill(); await mongo.stop(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", stop);
