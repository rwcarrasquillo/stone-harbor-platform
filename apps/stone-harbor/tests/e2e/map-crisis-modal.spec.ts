import { test, expect } from "@playwright/test";

/**
 * /map crisis modal — severe baseline.
 *
 * Submits Module 1.1 with the most-severe chip on every item, which
 * triggers PHQ-2 = 6 + GAD-2 = 6 → safety level "severe" → crisis
 * modal surfaces with country-specific resources. The modal MUST
 * appear before the session advances; without dismissal, the next
 * module should not render.
 *
 * This is the highest-stakes Phase 1 surface to keep regression-free.
 * If the modal stops appearing on severe input, the platform has
 * lost a load-bearing safety guarantee — that's exactly what this
 * test catches.
 *
 * Requires a SEPARATE test account from the happy-path spec
 * (TEST_MEMBER_CRISIS_EMAIL + TEST_MEMBER_CRISIS_PASSWORD) so the
 * two specs don't write conflicting responses to the same user's
 * eidos_responses row. If only the regular member creds are present,
 * the spec is skipped.
 */

const EMAIL = process.env.TEST_MEMBER_CRISIS_EMAIL;
const PASSWORD = process.env.TEST_MEMBER_CRISIS_PASSWORD;
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("/map crisis modal", () => {
  test.skip(
    !haveCreds,
    "Set TEST_MEMBER_CRISIS_EMAIL + TEST_MEMBER_CRISIS_PASSWORD to run.",
  );

  test("severe baseline surfaces the crisis modal with resources", async ({
    page,
  }) => {
    // Sign in.
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

    // Go to Map and begin.
    await page.goto("/en/map");
    const cta = page
      .getByRole("link", { name: /begin your map|continue your map/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
    await cta.click();
    if (/\/map\/begin$/.test(page.url())) {
      await page.getByRole("button", { name: /^begin$/i }).click();
    }
    await page.waitForURL(/\/map\/week\/1$/, { timeout: 15_000 });

    // Module 1.1 — pick the most-severe chip on every item.
    // "Nearly every day" is value 3 → PHQ-2 = 6, GAD-2 = 6 → severe.
    const severe = page.getByRole("button", { name: /^Nearly every day$/ });
    const count = await severe.count();
    expect(count).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < count; i++) {
      await severe.nth(i).click();
    }
    await page.getByRole("button", { name: /^Continue$/ }).click();

    // Crisis modal MUST appear. We look for the resources list rather
    // than a specific eyebrow string so this stays robust to copy
    // edits — the 988 entry is the most identifying signal.
    const resourcesHeader = page.getByText(/If you are in crisis/i);
    await expect(resourcesHeader).toBeVisible({ timeout: 10_000 });

    // At least one US resource line should be present.
    await expect(page.getByText(/988/)).toBeVisible();

    // Dismiss with "I'm okay to keep going" → modal closes →
    // next module renders (advancement was held until acknowledgment).
    await page.getByRole("button", { name: /okay to keep going/i }).click();
    await expect(resourcesHeader).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/MODULE\s*1\.2/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
