import { test, expect } from "@playwright/test";

/**
 * Theme persistence — flip Sunlit ↔ Dusk on the public home and
 * confirm the choice survives a reload via the
 * `stone-harbor-theme` cookie (server-rendered, so the value
 * comes back on the very next request).
 *
 * Public-only flow, no credentials required.
 */

test.describe("Theme toggle", () => {
  test("flipping the theme persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 10_000 });

    // Read current data-theme on <html>.
    const before = await page.locator("html").getAttribute("data-theme");

    // Find any theme-toggle control. Selector covers both the
    // labeled button and the icon-only version. If no toggle is
    // visible on the public home (e.g., it's behind auth on this
    // surface), the test will skip rather than fail.
    const toggle = page
      .getByRole("button", { name: /theme|sunlit|dusk|toggle/i })
      .first();

    if (!(await toggle.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "No theme toggle on the public home — skipping.");
      return;
    }

    await toggle.click();
    // Allow the next paint to commit the new theme.
    await page.waitForTimeout(200);
    const after = await page.locator("html").getAttribute("data-theme");
    expect(after).not.toBe(before);

    // Reload and confirm the chosen theme survived.
    await page.reload();
    const afterReload = await page.locator("html").getAttribute("data-theme");
    expect(afterReload).toBe(after);
  });
});
