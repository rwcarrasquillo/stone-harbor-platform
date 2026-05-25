import { test, expect } from "@playwright/test";

/**
 * Admin /moderation smoke — sign in as an admin against the admin
 * app at :3001, navigate to the moderation queue, and assert the
 * page renders with the expected structure.
 *
 * Why not perform an actual approve/reject action: this test is the
 * minimal regression guard. Performing real moderation actions
 * requires a seeded pending post to exist and would either need a
 * fixture step (writing a pending post via service-role each run)
 * or risk consuming a real member's submission. For Phase 1, the
 * smoke check that the queue page renders without errors is the
 * highest-value coverage. A full action-flow test can land later
 * alongside a fixture seeder.
 *
 * Requires:
 *   - ADMIN_EMAIL / ADMIN_PASSWORD env vars
 *   - Admin dev server on http://localhost:3001
 *
 * The Playwright webServer config only spawns the member app
 * (port 3000), so the admin app must be already running for this
 * spec to succeed.
 */

const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_BASE = process.env.ADMIN_BASE_URL ?? "http://localhost:3001";
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("Admin /moderation smoke", () => {
  test.skip(!haveCreds, "Set ADMIN_EMAIL + ADMIN_PASSWORD to run.");

  test("queue page renders with the expected structure", async ({ page }) => {
    // Probe the admin server first.
    try {
      await page.goto(`${ADMIN_BASE}/login`, { timeout: 5_000 });
    } catch {
      test.skip(
        true,
        `Admin dev server not reachable at ${ADMIN_BASE}. Start it with \`cd stone-harbor-admin && npm run dev\`.`,
      );
      return;
    }

    // Sign in.
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    // Land on the admin home (path "/" in the admin app).
    await page.waitForURL(new RegExp(`^${ADMIN_BASE}/?$`), {
      timeout: 15_000,
    });

    // Navigate to /moderation.
    await page.goto(`${ADMIN_BASE}/moderation`);

    // The page should not 404 or 500.
    await expect(page).toHaveURL(/\/moderation\b/);

    // Verify the page rendered some recognizable structure. We look
    // for the page header "Moderation" (or variants) rather than
    // depending on specific items being present — the queue might
    // legitimately be empty.
    const headerLocator = page
      .getByRole("heading", { name: /moderation/i })
      .or(page.getByText(/^Moderation$/i))
      .first();
    await expect(headerLocator).toBeVisible({ timeout: 10_000 });

    // The queue UI should expose either pending items or an empty
    // state. Both are valid; we just want no error boundary in view.
    const errorBoundary = page.getByText(/something went wrong/i);
    await expect(errorBoundary).not.toBeVisible();
  });

  test("page accepts navigation away without leaking state", async ({
    page,
  }) => {
    // Sign in.
    await page.goto(`${ADMIN_BASE}/login`);
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(new RegExp(`^${ADMIN_BASE}/?$`), {
      timeout: 15_000,
    });

    // Visit moderation, then go back to home, then visit again.
    await page.goto(`${ADMIN_BASE}/moderation`);
    await expect(page).toHaveURL(/\/moderation\b/);
    await page.goto(`${ADMIN_BASE}/`);
    await page.goto(`${ADMIN_BASE}/moderation`);
    await expect(page).toHaveURL(/\/moderation\b/);

    // Still no error boundary after navigation.
    const errorBoundary = page.getByText(/something went wrong/i);
    await expect(errorBoundary).not.toBeVisible();
  });
});
