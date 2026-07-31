import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

/**
 * Spine Ship 1 E2E (SH-109).
 *
 * Covers both states of the `app_settings.spine_enabled` kill switch
 * across every surface Ship 1 touches:
 *
 *   - flag OFF  → dashboard, /roadmap and /profile render exactly as
 *                 they did before the spine landed
 *   - flag ON   → dashboard leads with the current-step panel (plus
 *                 peek-at-next), /roadmap carries the "You're currently
 *                 on Step N" line, /profile carries the quiet line
 *   - flag ON, member on the final step (Strength 5) → no peek section
 *   - flag ON, member never placed on the path → dashboard falls back
 *   - flag ON → Settle-In's "Where to begin" screen writes the chosen
 *               step through /api/settle-in/complete
 *   - flag ON → Spanish copy resolves, no raw i18n keys
 *
 * WHY THIS FILE OWNS THE FLAG: `app_settings` is a singleton (id = 1),
 * so the flag is global to the database the suite runs against. This is
 * the ONLY spec that flips it — every describe here is serial and the
 * prior value is restored in afterAll. settle-in.spec.ts deliberately
 * asserts the flag-OFF path only, so no two spec files can race each
 * other over the same row under Playwright's `fullyParallel`.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read
 * from apps/stone-harbor/.env.local). When absent the spec skips so CI
 * in an unconfigured environment stays green.
 */

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveAdmin = Boolean(SUPABASE_URL && SERVICE_KEY);

const PASSWORD = "Spine-E2E-pw-4417!";
const STAMP = Date.now();
const EMAIL_PLACED = `spine-e2e-placed-${STAMP}@example.com`;
const EMAIL_FINAL = `spine-e2e-final-${STAMP}@example.com`;
const EMAIL_UNPLACED = `spine-e2e-unplaced-${STAMP}@example.com`;
const EMAIL_SETTLING = `spine-e2e-settling-${STAMP}@example.com`;

// Seed-data facts asserted against, verified against roadmap_steps
// (15 rows, canonical path order Calm → Clarity → Strength).
const CALM_1_TITLE = "Grounding in the body";
const CALM_2_TITLE = "Breath as anchor";
const STRENGTH_5_TITLE = "Living the new identity";
const CLARITY_3_TITLE = "Mapping the trigger";

let admin: SupabaseClient;
let priorFlag = false;
const userIds: Record<string, string> = {};
const stepIds: Record<string, string> = {};

async function setSpineFlag(enabled: boolean) {
  const { error } = await admin
    .from("app_settings")
    .update({ spine_enabled: enabled })
    .eq("id", 1);
  if (error) throw error;
}

async function stepId(stage: string, position: number): Promise<string> {
  const { data, error } = await admin
    .from("roadmap_steps")
    .select("id")
    .eq("stage", stage)
    .eq("position", position)
    .single();
  if (error) throw error;
  return data!.id as string;
}

/**
 * Create a throwaway Stone Harbor member. `admin_invited` bypasses the
 * registration gate; the AFTER-INSERT trigger creates the profiles row
 * in the same transaction. Onboarding + settle-in are stamped complete
 * unless `settled` is false, so the auth guard lets the member straight
 * through to the surfaces under test.
 */
async function createMember(
  email: string,
  opts: { settled?: boolean; currentStepId?: string | null } = {},
): Promise<string> {
  const { settled = true, currentStepId = null } = opts;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { admin_invited: "true", consumer: "stone_harbor" },
  });
  if (error) throw error;
  const id = data.user!.id;

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("profiles")
    .update({
      onboarding_completed_at: now,
      settle_in_completed_at: settled ? now : null,
      settle_in_skipped_at: null,
      current_roadmap_step_id: currentStepId,
      current_step_entered_at: currentStepId ? now : null,
    })
    .eq("id", id);
  if (upErr) throw upErr;
  return id;
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page
    .getByRole("button", { name: /sign in|log in/i })
    .first()
    .click();
  await page.waitForURL(/\/(dashboard|settle-in)/, { timeout: 20_000 });
}

// Serial across the whole file — every test reads or writes the same
// singleton flag row.
test.describe.configure({ mode: "serial" });

test.describe("Spine Ship 1", () => {
  test.skip(
    !haveAdmin,
    "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run.",
  );

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: settings, error: settingsErr } = await admin
      .from("app_settings")
      .select("spine_enabled")
      .eq("id", 1)
      .single();
    if (settingsErr) throw settingsErr;
    priorFlag = !!settings?.spine_enabled;

    stepIds.calm1 = await stepId("calm", 1);
    stepIds.strength5 = await stepId("strength", 5);
    stepIds.clarity3 = await stepId("clarity", 3);

    userIds.placed = await createMember(EMAIL_PLACED, {
      currentStepId: stepIds.calm1,
    });
    userIds.final = await createMember(EMAIL_FINAL, {
      currentStepId: stepIds.strength5,
    });
    userIds.unplaced = await createMember(EMAIL_UNPLACED);
    userIds.settling = await createMember(EMAIL_SETTLING, { settled: false });

    await setSpineFlag(false);
  });

  test.afterAll(async () => {
    // Restore the flag FIRST — leaving the harbor's kill switch flipped
    // would be the worst possible test residue.
    if (admin) {
      await setSpineFlag(priorFlag);
      for (const id of Object.values(userIds)) {
        await admin.auth.admin.deleteUser(id);
      }
    }
  });

  test("flag off — dashboard, roadmap and profile render as they do today", async ({
    page,
  }) => {
    await setSpineFlag(false);
    await signIn(page, EMAIL_PLACED);

    // Dashboard: rooms strip primary, no current-step panel and no
    // strip header — even though this member IS placed on Calm 1.
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByText("Journal").first()).toBeVisible();
    await expect(page.getByText("You're on", { exact: true })).toHaveCount(0);
    await expect(page.getByText(CALM_1_TITLE)).toHaveCount(0);
    await expect(page.getByText("Rooms available for this step")).toHaveCount(0);

    // /roadmap: no "currently on" line. The checklist chrome is intact.
    await page.goto("/roadmap");
    await expect(page.getByRole("button", { name: /clarity/i }).first()).toBeVisible();
    await expect(page.getByText(/You're currently on Step/)).toHaveCount(0);

    // /profile: no current-step line.
    await page.goto("/profile");
    await expect(page.getByText(/Currently on Step/)).toHaveCount(0);
  });

  test("flag on — dashboard leads with the current step and peeks at the next", async ({
    page,
  }) => {
    await setSpineFlag(true);
    await signIn(page, EMAIL_PLACED);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByText("You're on", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(CALM_1_TITLE)).toBeVisible();
    // Peek-at-next — Calm 1's next is Calm 2.
    await expect(page.getByText("Next", { exact: true })).toBeVisible();
    await expect(page.getByText(CALM_2_TITLE)).toBeVisible();
    await expect(page.getByText("When you're ready.")).toBeVisible();
    // Soft link out to the whole path.
    await expect(
      page.getByRole("link", { name: /See the whole path/i }),
    ).toBeVisible();
    // The rooms strip is demoted, not removed — it keeps every room and
    // takes the step-framing header.
    await expect(page.getByText("Rooms available for this step")).toBeVisible();
    await expect(page.getByText("Journal").first()).toBeVisible();
  });

  test("flag on — /roadmap marks the current step and /profile names it", async ({
    page,
  }) => {
    await setSpineFlag(true);
    await signIn(page, EMAIL_PLACED);

    await page.goto("/roadmap");
    await expect(
      page.getByText(`You're currently on Step 1: ${CALM_1_TITLE}.`),
    ).toBeVisible({ timeout: 15_000 });
    // Additive only — the checklist affordances are untouched.
    await expect(
      page.getByRole("button", { name: /mark complete/i }).first(),
    ).toBeVisible();

    await page.goto("/profile");
    await expect(
      page.getByText(`Currently on Step 1: ${CALM_1_TITLE}.`),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("flag on — the final step renders without a peek section", async ({
    page,
  }) => {
    await setSpineFlag(true);
    await signIn(page, EMAIL_FINAL);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByText(STRENGTH_5_TITLE)).toBeVisible({
      timeout: 15_000,
    });
    // Strength 5 is the last step on the path — nothing comes next.
    await expect(page.getByText("Next", { exact: true })).toHaveCount(0);
    await expect(page.getByText("When you're ready.")).toHaveCount(0);
  });

  test("flag on — a member never placed on the path falls back to the rooms strip", async ({
    page,
  }) => {
    await setSpineFlag(true);
    await signIn(page, EMAIL_UNPLACED);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByText("Journal").first()).toBeVisible();
    await expect(page.getByText("You're on", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Rooms available for this step")).toHaveCount(0);
  });

  test("flag on — Settle-In's 'Where to begin' writes the chosen step", async ({
    page,
  }) => {
    await setSpineFlag(true);
    await signIn(page, EMAIL_SETTLING);

    // Navigate to /settle-in explicitly rather than relying on a
    // dashboard gate. The client-side gate that used to bounce a
    // first-pass member here no longer exists in app/dashboard/page.tsx
    // (which is why settle-in.spec.ts's gate assertion fails on main —
    // a pre-existing gap, not something SH-109 introduced or owns).
    // Ship 1's contract is what the surface does once the member is on
    // it, so the test drives the surface directly.
    await page.goto("/settle-in");
    await page.waitForURL(/\/settle-in/, { timeout: 20_000 });

    // Screens 1 → 5, same crossfade discipline settle-in.spec.ts uses:
    // assert the incoming screen's copy before clicking, so the button
    // we click belongs to the live screen.
    await expect(page.getByText("You're here now.")).toBeVisible();
    await page.getByRole("button", { name: /step forward/i }).click();
    await page.waitForURL(/step=2/, { timeout: 10_000 });

    await expect(page.getByText("Brotherhood")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=3/, { timeout: 10_000 });

    await expect(page.getByText("There's also a Map.")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=4/, { timeout: 10_000 });

    await expect(page.getByText("We don't chase.")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=5/, { timeout: 10_000 });

    // With the spine on, screen 5 hands off to "Where to begin" rather
    // than entering the harbor itself.
    await expect(page.getByText("Before you step in.")).toBeVisible();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.waitForURL(/step=6/, { timeout: 10_000 });

    // Screen 6 — the harbor's suggestion, already chosen.
    await expect(page.getByText("Where to begin", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Choose where the harbor starts holding you."),
    ).toBeVisible();
    await expect(page.getByText(/Most men who arrive here start at Calm/)).toBeVisible();
    await expect(page.getByText(CALM_1_TITLE)).toBeVisible();

    // The whole path is one tap away, and choosing overrides Calm 1.
    await page
      .getByRole("button", { name: /Or choose where to begin/i })
      .click();
    await expect(page.getByText("The whole path")).toBeVisible();
    // All 15 steps are listed once the chooser expands.
    await expect(page.getByText(STRENGTH_5_TITLE)).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(CLARITY_3_TITLE, "i") })
      .first()
      .click();

    await page.getByRole("button", { name: /step into the harbor/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    // The completion write carried the chosen step.
    const { data, error } = await admin
      .from("profiles")
      .select(
        "settle_in_completed_at, current_roadmap_step_id, current_step_entered_at",
      )
      .eq("id", userIds.settling)
      .single();
    expect(error).toBeNull();
    expect(data?.settle_in_completed_at).toBeTruthy();
    expect(data?.current_roadmap_step_id).toBe(stepIds.clarity3);
    expect(data?.current_step_entered_at).toBeTruthy();
  });

  test("flag on — Spanish copy resolves with no raw keys", async ({
    page,
    context,
  }) => {
    await setSpineFlag(true);
    // Sign in first, THEN switch the locale cookie — the login form's
    // own copy localizes too, and matching its Spanish button name here
    // would only test next-intl, not the spine.
    await signIn(page, EMAIL_PLACED);
    await context.addCookies([
      {
        name: "NEXT_LOCALE",
        value: "es",
        url: "http://localhost:3000",
      },
    ]);
    await page.goto("/dashboard");
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await expect(page.getByText("Estás en", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Siguiente", { exact: true })).toBeVisible();
    await expect(page.getByText("Cuando estés listo.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Ver el sendero completo/i }),
    ).toBeVisible();
    await expect(
      page.getByText("Salas disponibles para este paso"),
    ).toBeVisible();
    // No un-resolved i18n keys leaking onto the page.
    await expect(page.getByText(/spine\.currentStep/)).toHaveCount(0);

    await page.goto("/roadmap");
    await expect(
      page.getByText(`Actualmente estás en el Paso 1: ${CALM_1_TITLE}.`),
    ).toBeVisible({ timeout: 15_000 });
  });
});
