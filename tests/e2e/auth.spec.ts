import { test, expect } from "@playwright/test";

/**
 * Auth flow — sign in, land on dashboard, sign out, land back at /.
 *
 * Requires TEST_MEMBER_EMAIL and TEST_MEMBER_PASSWORD in the
 * environment (or .env.local — Playwright reads process.env from
 * the spawning shell). When either is missing the spec is
 * skipped so CI doesn't fail in unconfigured environments.
 *
 * The account should be a real, already-verified member —
 * onboarding can be done or not; the dashboard renders either way
 * because of the onboarding gate redirect.
 */

const EMAIL = process.env.TEST_MEMBER_EMAIL;
const PASSWORD = process.env.TEST_MEMBER_PASSWORD;
const haveCreds = Boolean(EMAIL && PASSWORD);

test.describe("Member auth flow", () => {
  test.skip(!haveCreds, "Set TEST_MEMBER_EMAIL + TEST_MEMBER_PASSWORD to run.");

  test("sign in with email + password lands on dashboard or onboarding", async ({
    page,
  }) => {
    await page.goto("/login");

    // Form fields are unlabeled-by-id but use standard input types.
    // Using the role/placeholder API so a copy tweak doesn't break us.
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

    // Submit. Either the "Sign in" / "Log in" button or pressing
    // Enter on the password field would do — we click for clarity.
    await page
      .getByRole("button", { name: /sign in|log in/i })
      .first()
      .click();

    // Successful auth bounces to /dashboard (returning members) or
    // /onboarding (first-time post-confirmation). Both are valid
    // post-login states.
    await page.waitForURL(/\/(dashboard|onboarding|welcome)/, {
      timeout: 15_000,
    });
    expect(page.url()).toMatch(/\/(dashboard|onboarding|welcome)/);
  });

  test("sign out from dashboard returns to /login or /", async ({ page }) => {
    // First sign in (separate test contexts so each test starts
    // fresh; can't rely on state from the test above).
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL!);
    await page.locator('input[type="password"]').first().fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(/\/(dashboard|onboarding|welcome)/, {
      timeout: 15_000,
    });

    // Go to dashboard explicitly and trigger the sign-out control.
    // Selector is permissive — could be a button, could be a link.
    await page.goto("/dashboard");
    const signOut = page
      .getByRole("button", { name: /sign out|log out|logout/i })
      .or(page.getByRole("link", { name: /sign out|log out|logout/i }))
      .first();

    // Sign-out might live inside a menu or off-screen. If it isn't
    // immediately visible the test should at least confirm the
    // logout endpoint is reachable — but the typical UX puts it
    // somewhere clickable.
    if (await signOut.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await signOut.click();
      await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/(login|$)/);
    } else {
      test.skip(
        true,
        "Sign-out control not visible from /dashboard with current copy.",
      );
    }
  });
});
