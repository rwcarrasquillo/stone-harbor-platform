import { test, expect } from "@playwright/test";

/**
 * Smoke tests for the unauthenticated home page. The home is the
 * front door — if it doesn't render the brand mark and doesn't
 * expose a path to sign in, nothing else matters.
 */
test.describe("Public home page", () => {
  test("renders the brand mark and main heading", async ({ page }) => {
    await page.goto("/");
    // The brand mark text appears in metadata + visible header. We
    // accept either casing and the word "Stone Harbor" anywhere.
    await expect(page).toHaveTitle(/Stone Harbor/i);
    // The hero contains a primary heading — its text varies with
    // the marketing copy, so we assert the existence of an h1.
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("has a sign-in link reachable", async ({ page }) => {
    await page.goto("/");
    // Any link or button leading to /login. Using Playwright's
    // chained locator API rather than mixing CSS pseudo-selectors,
    // which the previous version did incorrectly.
    const signIn = page
      .locator('a[href*="/login"]')
      .or(page.getByRole("link", { name: /sign in|log in/i }))
      .or(page.getByRole("button", { name: /sign in|log in/i }))
      .first();
    await expect(signIn).toBeVisible({ timeout: 10_000 });
  });
});
