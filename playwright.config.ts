import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end scenarios against a running app + local Supabase-compatible stack with dev seed data:
 *   npm run stack:reset && npm run db:seed:dev && npm run test:e2e
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { AUTH_RATE_LIMIT_FACTOR: "50" },
  },
});
