import { test, expect } from "@playwright/test";

/**
 * Journal write smoke — sign in, navigate to /journal, fill in
 * an entry, save, confirm the new entry shows up in the list.
 *
 * Requires TEST_MEMBER_EMAIL + TEST_MEMBER_PASSWORD.
 *
 * Side effect: writes a real journal_entries row owned by the test
 * member. Acceptable for now since the test member is your QA
 * account; if you want strict idempotence later, switch to
 * spawning a throwaway user via the service-role API.
 */

const EMAIL = process.env.TEST_MEMBER_EMAIL;
const PASSWORD = process.env.TEST_MEMBER_PASSWORD;
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("Journal flow", () => {
  test.skip(!haveCreds, "Set TEST_MEMBER_EMAIL + TEST_MEMBER_PASSWORD to run.");

  test("write and save a journal entry", async ({ page }) => {
    // Sign in.
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(/\/(dashboard|onboarding|welcome)/, {
      timeout: 15_000,
    });

    // Go to the journal door.
    await page.goto("/journal");
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // The journal textarea — selector is intentionally loose so a
    // copy edit on the placeholder ("What's here today?") doesn't
    // break us. We grab the largest textarea on the page.
    const textarea = page.locator("textarea").first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    const marker = `e2e-${Date.now()}`;
    await textarea.fill(`Test entry from Playwright. Marker: ${marker}`);

    // Save / Submit button. Could be labeled "Save", "Submit",
    // "Keep this".
    const save = page
      .getByRole("button", { name: /save|submit|keep this/i })
      .first();
    await expect(save).toBeEnabled({ timeout: 5_000 });
    await save.click();

    // After save we expect either (a) the textarea to clear or
    // (b) the entry to appear in a visible list. We assert the
    // weaker of the two — the marker becomes findable on the
    // page (the entries list typically renders the body or a
    // preview of it).
    await expect(page.getByText(marker, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });
});
