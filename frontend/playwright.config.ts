import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    { command: "node e2e/start-backend.mjs", url: "http://localhost:4100/health/ready", timeout: 120_000, reuseExistingServer: false },
    { command: "npx next dev --port 3100", url: "http://localhost:3100/login", timeout: 120_000, reuseExistingServer: false, env: { NEXT_PUBLIC_API_URL: "http://localhost:4100/api/v1" } },
  ],
});
