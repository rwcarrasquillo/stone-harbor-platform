import { test, expect } from "@playwright/test";

/**
 * Preview-day badge — the founder's day-stepping affordance.
 *
 * Behavior under test: visiting any page with `?previewDay=N` in
 * the URL should surface the floating badge that reads
 * `Previewing Day {N}`. This is the regression that was
 * previously failing — the useEffect dependency needed pathname
 * so client-side nav reactivity kicked in.
 */
test.describe("PreviewDayBadge", () => {
  test("appears when ?previewDay=60 is set", async ({ page }) => {
    await page.goto("/?previewDay=60");
    // Allow up to 10s for the client to read the URL and mount
    // the badge after hydration.
    await expect(
      page.getByText(/Previewing Day 60/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
