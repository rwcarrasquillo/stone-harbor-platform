import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import path from "node:path";

/**
 * Auth guards across member surfaces (SH-110).
 *
 * `lib/authGuards.ts` exports `requireActiveSession()`, which runs three
 * sequential gates — signed in → not suspended → settle-in complete —
 * and hard-navigates on each failure. SH-110 wired it into every
 * authenticated member surface after it was found orphaned: it existed,
 * was well documented, and was called by nothing.
 *
 * That drift was invisible because no test asserted the gate from the
 * outside. This spec is that assertion. It walks EVERY member surface
 * as an unsettled member and as a suspended member, and checks each one
 * routes where it should. If someone later reverts a page to the raw
 * `supabase.auth.getUser()` pattern, exactly one line here goes red and
 * names the surface.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (read
 * from apps/stone-harbor/.env.local). When absent the spec skips so CI
 * in an unconfigured environment stays green.
 */

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const haveAdmin = Boolean(SUPABASE_URL && SERVICE_KEY);

const PASSWORD = "AuthGuards-E2E-pw-6620!";
const STAMP = Date.now();
const EMAIL_UNSETTLED = `auth-guards-e2e-unsettled-${STAMP}@example.com`;
const EMAIL_SUSPENDED = `auth-guards-e2e-suspended-${STAMP}@example.com`;
const EMAIL_ACTIVE = `auth-guards-e2e-active-${STAMP}@example.com`;

/**
 * Every authenticated member surface SH-110 wired the guard into.
 * `/map` covers the whole map tree — its four pages share the
 * `useHarborAuthGuard` hook in MapChrome.tsx.
 */
const MEMBER_SURFACES = [
  "/dashboard",
  "/roadmap",
  "/profile",
  "/letters",
  "/resources",
  "/journal",
  "/journal/compose",
  "/journal/archive",
  "/vent",
  "/meditation",
  "/messages",
  "/map",
  "/lineage",
];

let admin: SupabaseClient;
const userIds: Record<string, string> = {};

async function createMember(
  email: string,
  opts: { settled?: boolean; suspended?: boolean } = {},
): Promise<string> {
  const { settled = true, suspended = false } = opts;
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
      suspended_at: suspended ? now : null,
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
  // Don't assert the landing URL here — that IS what each test measures.
  await page.waitForURL(/\/(dashboard|settle-in|suspended)/, {
    timeout: 20_000,
  });
}

/**
 * Assert a page did NOT redirect away.
 *
 * Deliberately a fixed settle rather than `networkidle`: several harbor
 * surfaces animate continuously (the breath circle, the horizon mark's
 * 4s pulse) or hold open Supabase channels, so the network never truly
 * goes idle and the wait times out on a perfectly healthy page. Proving
 * a redirect did not happen means giving the client a beat to fire one
 * and then looking — there's no event to await for "nothing happened."
 */
async function settleAndAssertStay(page: Page, surface: string, why: string) {
  await page.waitForLoadState("load", { timeout: 15_000 });
  await page.waitForTimeout(1_200);
  expect(page.url(), `${surface} ${why}`).toContain(surface);
}

test.describe("Auth guards across member surfaces", () => {
  test.skip(
    !haveAdmin,
    "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run.",
  );

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    userIds.unsettled = await createMember(EMAIL_UNSETTLED, { settled: false });
    userIds.suspended = await createMember(EMAIL_SUSPENDED, {
      suspended: true,
    });
    userIds.active = await createMember(EMAIL_ACTIVE);
  });

  test.afterAll(async () => {
    if (!admin) return;
    for (const id of Object.values(userIds)) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  test("an unsettled member is routed to /settle-in from every surface", async ({
    page,
  }) => {
    await signIn(page, EMAIL_UNSETTLED);
    // Signing in lands on /dashboard, whose guard bounces to /settle-in.
    // This is the exact regression SH-110 fixes.
    await page.waitForURL(/\/settle-in/, { timeout: 20_000 });

    for (const surface of MEMBER_SURFACES) {
      await page.goto(surface);
      await page
        .waitForURL(/\/settle-in/, { timeout: 15_000 })
        .catch(() => undefined);
      expect(page.url(), `${surface} should route an unsettled member to /settle-in`).toMatch(
        /\/settle-in/,
      );
    }
  });

  test("a suspended member is routed to /suspended from every surface", async ({
    page,
  }) => {
    await signIn(page, EMAIL_SUSPENDED);
    await page.waitForURL(/\/suspended/, { timeout: 20_000 });

    for (const surface of MEMBER_SURFACES) {
      await page.goto(surface);
      await page
        .waitForURL(/\/suspended/, { timeout: 15_000 })
        .catch(() => undefined);
      expect(page.url(), `${surface} should route a suspended member to /suspended`).toMatch(
        /\/suspended/,
      );
    }
  });

  test("an active settled member reaches every surface without a redirect loop", async ({
    page,
  }) => {
    await signIn(page, EMAIL_ACTIVE);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    for (const surface of MEMBER_SURFACES) {
      await page.goto(surface);
      await settleAndAssertStay(page, surface, "should render for an active member");
    }
  });

  test("public surfaces stay reachable signed out", async ({ page }) => {
    // The guard must not have leaked onto anything public. /keepers is
    // public per SH-108, /crisis-resources per SH-105.
    for (const surface of ["/keepers", "/crisis-resources", "/privacy", "/terms"]) {
      await page.goto(surface);
      await settleAndAssertStay(page, surface, "must not be gated");
    }
  });
});
