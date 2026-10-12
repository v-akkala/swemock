import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a live app (docker compose up, or `pnpm dev` plus the runner).
 * Point them elsewhere with SWEMOCK_URL. They use the real judge: a handful of submits take a minute.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SWEMOCK_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 1400, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
});
