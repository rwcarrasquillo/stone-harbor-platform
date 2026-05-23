import { defineConfig, devices } from "@playwright/test";

/**
 * Stone Harbor — Playwright config.
 *
 * E2E tests run against a local dev server unless E2E_BASE_URL is
 * set (in CI, point this at a preview deployment). We deliberately
 * use webServer.command to spin up `next dev` for the test runner
 * so contributors don't have to remember to start it first.
 *
 * The JSON reporter writes to .test-results/e2e.json so the ingest
 * script can pick it up and feed /admin/tests.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["json", { outputFile: ".test-results/e2e.json" }],
  ],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
