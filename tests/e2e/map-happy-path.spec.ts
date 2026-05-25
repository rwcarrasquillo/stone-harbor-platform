import { test, expect } from "@playwright/test";

/**
 * /map happy path — Module 1.1 (baseline) with safe values.
 *
 * Signs in as the test member, navigates to /en/map, begins a session,
 * completes Module 1.1 by selecting the "Not at all" chip on every
 * item (which guarantees the safety eval returns "none" and the
 * crisis modal does NOT surface), then verifies the session has
 * advanced to Module 1.2.
 *
 * Requires TEST_MEMBER_EMAIL + TEST_MEMBER_PASSWORD. Skipped
 * otherwise. The test cleans up after itself by NOT clearing the
 * member's existing session — the /api/map/begin endpoint is
 * idempotent and `respond` upserts, so a re-run will simply resubmit
 * the same answers without breaking anything.
 */

const EMAIL = process.env.TEST_MEMBER_EMAIL;
const PASSWORD = process.env.TEST_MEMBER_PASSWORD;
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("/map happy path", () => {
  test.skip(!haveCreds, "Set TEST_MEMBER_EMAIL + TEST_MEMBER_PASSWORD to run.");

  test("member can begin the Map and complete Module 1.1 with safe values", async ({
    page,
  }) => {
    // Sign in via /login. Same selectors as the existing auth spec
    // so a copy tweak there doesn't desync this test.
    await page.goto("/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .or(page.locator('input[type="email"]'))
      .first()
      .fill(EMAIL!);
    await page
      .getByRole("textbox", { name: /password/i })
      .or(page.locator('input[type="password"]'))
      .first()
      .fill(PASSWORD!);
    await page
      .getByRole("button", { name: /sign in|log in/i })
      .first()
      .click();
    await page.waitForURL(/\/(dashboard|onboarding|welcome|en|es)/, {
      timeout: 15_000,
    });

    // Visit the English Map.
    await page.goto("/en/map");

    // Either "Begin your map" (no session) or "Continue your map"
    // (existing session) is acceptable — the API is idempotent.
    const cta = page
      .getByRole("link", { name: /begin your map|continue your map/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();

    // /map/begin → click Begin → routes to /map/week/1.
    // (If the existing session was already past /begin, we'll be on
    // /week/1 already; both paths are valid.)
    if (/\/map\/begin$/.test(page.url())) {
      await page.getByRole("button", { name: /^begin$/i }).click();
    }
    await page.waitForURL(/\/map\/week\/1$/, { timeout: 15_000 });

    // Module 1.1 — pick the safest chip on every PHQ-2 / GAD-2 item.
    // The labels are "Not at all" in English and we select all four.
    const safe = page.getByRole("button", { name: /^Not at all$/ });
    const count = await safe.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      await safe.nth(i).click();
    }

    // Submit → the server scores PHQ-2 = 0, GAD-2 = 0 → safety level
    // is "none" → crisis modal does NOT surface → session advances.
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // Module 1.2 (How you are wired) renders next. The eyebrow text
    // is the easiest stable anchor.
    await expect(page.getByText(/MODULE\s*1\.2/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/how you are wired/i)).toBeVisible();
  });
});
