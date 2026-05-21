/**
 * Stone Harbor — shared auth guards for client pages.
 *
 * Every authenticated page must redirect on three conditions:
 *   1. No session     → /login
 *   2. Suspended      → /suspended
 *   3. Not onboarded  → /onboarding (dashboard handles this for new accounts;
 *                       other surfaces redirect to dashboard which then routes)
 *
 * Call `requireActiveSession()` at the top of any page's load function.
 * Returns the authenticated user if the session is healthy + the account
 * is active + onboarding is complete. Returns null after triggering a
 * redirect — callers should `if (!user) return;` immediately.
 *
 * Why a function and not a hook: most existing pages use async `checkUser`
 * patterns rather than full hooks. A plain async function plugs in with a
 * single line and zero refactor.
 */

import { supabase } from "@/lib/supabaseClient";

/**
 * A confirmed-active member session. Returned by
 * {@link requireActiveSession} when all three gates pass: signed in,
 * not suspended, and onboarding complete.
 */
export type ActiveSession = {
  /** Supabase auth.users.id (UUID). */
  id: string;
  /** The member's email, or null if Supabase auth didn't return one. */
  email: string | null;
};

/**
 * Guards an authenticated client page. Performs three sequential checks
 * and side-effects a redirect when any fails:
 *
 *   1. **Auth** — must have an active Supabase session, otherwise routes
 *      to `/login` with a hard navigation (to nuke any stale state).
 *   2. **Suspension** — `profiles.suspended_at` must be null, otherwise
 *      routes to `/suspended` so the member can see warnings + appeal.
 *   3. **Onboarding** — `profiles.onboarding_completed_at` must be set,
 *      otherwise routes to `/onboarding` for the wizard.
 *
 * The check order matters: a suspended new member must land at
 * `/suspended` rather than be forced through onboarding first.
 *
 * @returns the {@link ActiveSession} if all three gates pass; `null`
 *   after triggering a redirect. Callers should immediately
 *   `if (!session) return;` to short-circuit the rest of their load
 *   function.
 *
 * @example
 * ```ts
 * async function loadPage() {
 *   const session = await requireActiveSession();
 *   if (!session) return;
 *   const { data } = await supabase
 *     .from("journal_entries")
 *     .select("*")
 *     .eq("user_id", session.id);
 *   // ...
 * }
 * ```
 */
export async function requireActiveSession(): Promise<ActiveSession | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  // Pull only what we need to make routing decisions. Cheap query.
  const { data: profile } = await supabase
    .from("profiles")
    .select("suspended_at, onboarding_completed_at")
    .eq("id", user.id)
    .single();

  // Suspension takes priority — even an un-onboarded suspended user
  // must land on /suspended, not /onboarding.
  if (profile?.suspended_at) {
    if (typeof window !== "undefined") window.location.href = "/suspended";
    return null;
  }

  if (!profile?.onboarding_completed_at) {
    if (typeof window !== "undefined") window.location.href = "/onboarding";
    return null;
  }

  return { id: user.id, email: user.email ?? null };
}
