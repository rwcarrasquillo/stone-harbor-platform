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
 * Eidos Admin — TOTP verify POST (step 2 of 2).
 *
 * Used both to finish enrolment (form carries the new factorId) and for
 * every later sign-in (no factorId: we use the admin's verified TOTP
 * factor). A correct code upgrades the session to aal2. The middleware has
 * already confirmed an active admin session before this runs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return redirect(req, "/login?error=unconfigured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect(req, "/login");

  const form = await req.formData().catch(() => null);
  const field = (name: string) =>
    form && typeof form.get(name) === "string" ? (form.get(name) as string) : "";
  const code = field("code").replace(/\s+/g, "");
  const next = safeRedirect(field("next") || null);
  const submittedFactorId = field("factorId");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const owned = factors?.all ?? [];
  const factorId = submittedFactorId
    ? owned.find((f) => f.id === submittedFactorId && f.factor_type === "totp")?.id
    : factors?.totp?.[0]?.id;

  const enrolling = Boolean(submittedFactorId);
  const back = enrolling ? "/login/enroll" : "/login/mfa";
  const backQuery = `next=${encodeURIComponent(next)}`;

  if (!factorId) return redirect(req, `/login?error=invalid&${backQuery}`);

  const key = `mfa:${user.id}`;
  if (isThrottled(key)) return redirect(req, `${back}?error=throttled&${backQuery}`);

  if (!/^\d{6}$/.test(code)) {
    return redirect(req, `${back}?error=invalid_code&${backQuery}`);
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    recordFailure(key);
    return redirect(req, `${back}?error=invalid_code&${backQuery}`);
  }

  clearFailures(key);
  return redirect(req, next);
}

function redirect(req: NextRequest, location: string): NextResponse {
  return NextResponse.redirect(new URL(location, req.url), { status: 303 });
}
