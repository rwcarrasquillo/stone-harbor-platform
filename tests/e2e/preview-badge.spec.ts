import { expect, test } from "@playwright/test";

/**
 * Preview-day badge smoke tests.
 *
 * The badge is the founder's lever for testing every gated feature.
 * It's critical that:
 *   1. ?previewDay=N activates the badge
 *   2. ?previewDay=clear deactivates it
 *   3. The badge does NOT appear by default (members never see it)
 *
 * These tests use the public /login page so no authentication is
 * needed — the badge is mounted in the root layout and visible on
 * every route.
 */

test.describe("PreviewDayBadge", () => {
  test("does not render when no override is active", async ({ page }) => {
    await page.goto("/login");
    // The badge contains the literal text "Previewing Day"
    await expect(page.getByText(/Previewing Day/i)).not.toBeVisible();
  });

  test("appears when ?previewDay=60 is set", async ({ page }) => {
    await page.goto("/login?previewDay=60");
    await expect(page.getByText(/Previewing Day 60/i)).toBeVisible();
  });

  test("hides again when ?previewDay=clear is visited", async ({ page }) => {
    // First activate so we have something to clear
    await page.goto("/login?previewDay=75");
    await expect(page.getByText(/Previewing Day 75/i)).toBeVisible();
    // Then clear
    await page.goto("/login?previewDay=clear");
    await expect(page.getByText(/Previewing Day/i)).not.toBeVisible();
  });
});
