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

export type ActiveSession = {
  id: string;
  email: string | null;
};

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
