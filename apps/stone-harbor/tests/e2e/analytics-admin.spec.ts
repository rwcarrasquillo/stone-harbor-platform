import { test, expect } from "@playwright/test";

/**
 * Admin /analytics smoke — log in as an admin against the admin
 * app at :3001 and assert each major section heading is present.
 *
 * Section headings come from the analytics page render code; if a
 * future refactor accidentally drops one, this test catches it.
 *
 * Requires:
 *   - ADMIN_EMAIL / ADMIN_PASSWORD env vars (Rafael's account)
 *   - The admin dev server running on http://localhost:3001
 *
 * The Playwright webServer config only spawns the member app
 * (port 3000), so the admin app must be already running for this
 * spec to succeed. When it isn't, the goto times out and the
 * test is skipped with a helpful message.
 */

const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_BASE = process.env.ADMIN_BASE_URL ?? "http://localhost:3001";
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("Admin /analytics smoke", () => {
  test.skip(!haveCreds, "Set ADMIN_EMAIL + ADMIN_PASSWORD to run.");

  test("renders every analytics section heading", async ({ page }) => {
    // Probe the admin server first so we fail fast with a clear
    // message if it isn't running.
    try {
      await page.goto(`${ADMIN_BASE}/login`, { timeout: 5_000 });
    } catch {
      test.skip(
        true,
        `Admin dev server not reachable at ${ADMIN_BASE}. Start it with \`cd ~/Desktop/stone-harbor-admin && npm run dev\`.`,
      );
      return;
    }

    // Sign in (same form as the member app).
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(new RegExp(`${ADMIN_BASE.replace(/^https?:\/\//, "")}/?$|/dashboard|/`), {
      timeout: 15_000,
    });

    // Navigate to /analytics.
    await page.goto(`${ADMIN_BASE}/analytics`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Every section heading the analytics page is supposed to
    // render. We assert each one is visible somewhere on the page.
    const expectedHeadings = [
      /Analytics\./i,
      /Acquisition/i,
      /Geography/i,
      /Healing path progression/i,
      /Cohort retention/i,
      /When members visit/i,
      /Top member pages/i,
      /Recent member visits/i,
      /Top admin features/i,
      /Recent sessions/i,
      /Recent activity/i,
    ];
    for (const heading of expectedHeadings) {
      await expect(
        page.getByText(heading).first(),
        `expected analytics page to contain a section matching ${heading}`,
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
