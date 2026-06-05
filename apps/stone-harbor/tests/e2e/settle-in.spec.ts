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
  });

  test.afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("dashboard gates a first-pass member through all five screens", async ({ page }) => {
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

    // Screen 5 — the entrance.
    await expect(page.getByText("Before you step in.")).toBeVisible();
    await page.getByRole("button", { name: /step into the harbor/i }).click();

    // Lands on the dashboard after the crossfade.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    expect(page.url()).toMatch(/\/dashboard/);

    // settle_in_completed_at is now stamped; skipped stays null.
    const { data, error } = await admin
      .from("profiles")
      .select("settle_in_completed_at, settle_in_skipped_at")
      .eq("id", userId!)
      .single();
    expect(error).toBeNull();
    expect(data?.settle_in_completed_at).toBeTruthy();
    expect(data?.settle_in_skipped_at).toBeNull();
  });
});
