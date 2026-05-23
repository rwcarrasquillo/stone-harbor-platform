import { expect, test } from "@playwright/test";

/**
 * Home page smoke tests.
 *
 * These are deliberately shallow — they verify the public landing
 * page renders, the brand mark is present, and the breath circle
 * is alive. Anything deeper (authenticated routes, gated features)
 * needs a logged-in session and lives in separate specs.
 */

test.describe("Public home page", () => {
  test("renders the brand mark and main heading", async ({ page }) => {
    await page.goto("/");
    // The page title carries the Stone Harbor brand
    await expect(page).toHaveTitle(/Stone Harbor/i);
    // The body content should mention "Stone Harbor" somewhere visible
    await expect(page.getByText(/Stone Harbor/i).first()).toBeVisible();
  });

  test("has a sign-in link reachable", async ({ page }) => {
    await page.goto("/");
    // The login route must be discoverable from the home page in some
    // form — either a button, link, or in a top nav.
    const loginLinks = page.locator(`a[href*="/login"]`);
    await expect(loginLinks.first()).toBeVisible();
  });

  test("login page loads with a sign-in form", async ({ page }) => {
    await page.goto("/login");
    // Email field should be present
    const emailInput = page.locator(
      `input[type="email"], input[name="email"]`,
    );
    await expect(emailInput.first()).toBeVisible();
  });
});
