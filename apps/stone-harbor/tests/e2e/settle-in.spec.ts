import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

/**
 * Settle-in flow E2E.
 *
 * Creates a throwaway, admin-invited Stone Harbor member (consumer =
 * stone_harbor) with onboarding marked complete but settle-in untouched,
 * signs in, confirms the dashboard gate sends them to /settle-in, walks all
 * five screens, steps into the harbor, and verifies settle_in_completed_at
 * is stamped and they land on /dashboard. The synthetic account is deleted
 * in afterAll (DB hygiene).
 *
 * SH-109 (spine Ship 1) added a sixth screen — "Where to begin" — behind
 * `app_settings.spine_enabled`, which moved the entrance gesture off
 * screen 5 and onto screen 6 whenever the flag is on.
 *
 * This spec READS that flag and walks whichever flow is actually
 * deployed, rather than assuming one. It used to assume flag-off, and
 * went red the moment the flag was flipped in prod even though nothing
 * about the app was broken — a test asserting a configuration instead
 * of a behavior. It still never WRITES the flag: spine.spec.ts remains
 * the only spec that mutates the singleton row, so the two can't race
 * under Playwright's `fullyParallel`.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read from
 * apps/stone-harbor/.env.local). When absent the spec skips so CI in an
 * unconfigured environment stays green.
 */

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveAdmin = Boolean(SUPABASE_URL && SERVICE_KEY);

const PASSWORD = "SettleIn-E2E-pw-9271!";
const EMAIL = `settle-in-e2e-${Date.now()}@example.com`;

let admin: SupabaseClient;
let userId: string | null = null;
/** Read (never written) in beforeAll — decides which flow to walk. */
let spineEnabled = false;

// Serial: both tests sign in as the same throwaway member, and the
// first one walks it through to completion. Running them concurrently
// would have two contexts racing the same profile row.
test.describe.configure({ mode: "serial" });

test.describe("Settle-in flow", () => {
  test.skip(!haveAdmin, "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run.");

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // admin_invited bypasses the registration gate; consumer stamps the
    // profile as a Stone Harbor member. The AFTER-INSERT trigger creates
    // the profiles row in the same transaction, so it exists right after.
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { admin_invited: "true", consumer: "stone_harbor" },
    });
    if (error) throw error;
    userId = data.user!.id;

    // Mark onboarding complete (so the onboarding gate doesn't intercept)
    // and ensure settle-in is genuinely first-pass.
    const { error: upErr } = await admin
      .from("profiles")
      .update({
        onboarding_completed_at: new Date().toISOString(),
        settle_in_completed_at: null,
        settle_in_skipped_at: null,
      })
      .eq("id", userId);
    if (upErr) throw upErr;

    const { data: settings, error: settingsErr } = await admin
      .from("app_settings")
      .select("spine_enabled")
      .eq("id", 1)
      .single();
    if (settingsErr) throw settingsErr;
    spineEnabled = !!settings?.spine_enabled;
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("dashboard gates a first-pass member through the settle-in flow", async ({ page }) => {
    // Sign in.
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();

    // The dashboard's client-side gate bounces a first-pass member to
    // /settle-in (defaulting to step 1).
    await page.waitForURL(/\/settle-in/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/settle-in/);

    // Screen-to-screen uses an AnimatePresence "wait" crossfade, so the
    // outgoing screen's button lingers ~500ms. Before each click we assert
    // the incoming screen's unique copy is on-screen — that guarantees the
    // old screen has fully unmounted and the button we click is the live one.

    // Screen 1 → 2.
    await expect(page.getByText("You're here now.")).toBeVisible();
    await page.getByRole("button", { name: /step forward/i }).click();
    await page.waitForURL(/step=2/, { timeout: 10_000 });

    // Screen 2 → 3. (Door cards are descriptions, not navigation.)
    await expect(page.getByText("Brotherhood")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=3/, { timeout: 10_000 });

    // Screen 3 → 4.
    await expect(page.getByText("There's also a Map.")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=4/, { timeout: 10_000 });

    // Screen 4 → 5.
    await expect(page.getByText("We don't chase.")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=5/, { timeout: 10_000 });

    // Screen 5 — the last locked screen.
    await expect(page.getByText("Before you step in.")).toBeVisible();

    if (spineEnabled) {
      // The spine moves the entrance onto screen 6 so the chosen step
      // rides along with the completion write. Screen 5 hands off with
      // the same quiet "Continue" the three screens before it use. The
      // picker's own mechanics are spine.spec.ts's job; here we only
      // need the flow to reach the entrance and complete.
      await page.getByRole("button", { name: /continue/i }).click();
      await page.waitForURL(/step=6/, { timeout: 10_000 });
      await expect(
        page.getByText("Where to begin", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(page.getByText("Where to begin")).toHaveCount(0);
    }

    await page.getByRole("button", { name: /step into the harbor/i }).click();

    // Lands on the dashboard after the crossfade.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/dashboard/);

    // settle_in_completed_at is stamped either way; skipped stays null.
    const { data, error } = await admin
      .from("profiles")
      .select(
        "settle_in_completed_at, settle_in_skipped_at, current_roadmap_step_id, current_step_entered_at",
      )
      .eq("id", userId!)
      .single();
    expect(error).toBeNull();
    expect(data?.settle_in_completed_at).toBeTruthy();
    expect(data?.settle_in_skipped_at).toBeNull();

    if (spineEnabled) {
      // The picker's pre-selected Calm 1 travelled with the write.
      expect(data?.current_roadmap_step_id).toBeTruthy();
      expect(data?.current_step_entered_at).toBeTruthy();
    } else {
      // No picker ran, so the member isn't placed on the path and the
      // dashboard keeps its rooms-strip layout.
      expect(data?.current_roadmap_step_id).toBeNull();
      expect(data?.current_step_entered_at).toBeNull();
    }
  });

  test("brand-crumb links back to dashboard", async ({ page }) => {
    // SH-115 — /settle-in wears the same harbor-vocabulary crumb as
    // every other member surface. Signing in first because the page
    // sends anyone without a session to /login before it renders.
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL(/\/(dashboard|settle-in)/, { timeout: 20_000 });

    await page.goto("/settle-in");
    const crumbLink = page.getByRole("link", {
      name: /Stone Harbor — Dashboard/i,
    });
    await expect(crumbLink).toBeVisible();
    await expect(crumbLink).toHaveAttribute("href", "/dashboard");
    await expect(crumbLink).toContainText("Settle In");

    // Skip moved into the header row and kept its handler. Asserting it
    // is reachable here guards the relocation, not the write — the
    // write is the flow test above.
    await expect(
      page.getByRole("button", { name: /skip settle-in/i }),
    ).toBeVisible();
  });
});
