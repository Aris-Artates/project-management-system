import { defineConfig } from "@playwright/test";

// Smoke tests against a running app with the demo seed loaded.
// Uses the installed Chrome (no browser download). Run: npm run test:e2e
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3200",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3200/login", reuseExistingServer: true, timeout: 120_000 },
});
