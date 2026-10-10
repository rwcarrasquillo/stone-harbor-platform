import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  clearFailures,
  clientKey,
  isThrottled,
  recordFailure,
} from "@/lib/loginThrottle";
import { safeRedirect } from "@/lib/safeRedirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Eidos Admin — login POST (step 1 of 2: email + password).
 *
 * Supabase Auth checks the credentials. The account must also have an
 * active row in eidos_admin_users; otherwise the session is dropped and the
 * visitor sees the same generic "invalid" error as a wrong password, so
 * nobody can probe which emails are admins. A successful step 1 only gives
 * an aal1 session — the middleware keeps it out of the app until TOTP
 * (step 2, /login/mfa or /login/enroll) raises it to aal2.
 *
 * Repeated failures from one client are throttled (best-effort, per
 * instance; Supabase Auth also rate-limits sign-ins).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FIELD = 320;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirect(req, "/login?error=unconfigured");

  const key = `login:${clientKey(req.headers)}`;
  if (isThrottled(key)) return redirect(req, "/login?error=throttled");

  const form = await req.formData().catch(() => null);
  const field = (name: string) =>
    form && typeof form.get(name) === "string" ? (form.get(name) as string) : "";
  const email = field("email").trim().toLowerCase();
  const password = field("password");
  const next = safeRedirect(field("next") || null);
  const nextQuery = `next=${encodeURIComponent(next)}`;

  if (!email || !password || email.length > MAX_FIELD || password.length > MAX_FIELD) {
    return redirect(req, `/login?error=missing&${nextQuery}`);
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    recordFailure(key);
    return redirect(req, `/login?error=invalid&${nextQuery}`);
  }

  const { data: adminRow } = await supabase
    .from("eidos_admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!adminRow) {
    await supabase.auth.signOut({ scope: "local" });
    recordFailure(key);
    return redirect(req, `/login?error=invalid&${nextQuery}`);
  }

  clearFailures(key);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const step = aal?.nextLevel === "aal2" ? "/login/mfa" : "/login/enroll";
  return redirect(req, `${step}?${nextQuery}`);
}

function redirect(req: NextRequest, location: string): NextResponse {
  return NextResponse.redirect(new URL(location, req.url), { status: 303 });
}
