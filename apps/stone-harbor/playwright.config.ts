import { defineConfig, devices } from "@playwright/test";

/**
 * Stone Harbor — Playwright config.
 *
 * E2E tests run against the local dev server (port 3000). They
 * spin the server up automatically if it's not already running.
 * Only Chromium is exercised — running all three browsers slows
 * the suite without buying us coverage we care about at this
 * stage. WebKit / Firefox can be added if a real
 * browser-specific bug appears.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"], ["json", { outputFile: ".test-results/e2e.json" }]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 5000,
    navigationTimeout: 15000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
