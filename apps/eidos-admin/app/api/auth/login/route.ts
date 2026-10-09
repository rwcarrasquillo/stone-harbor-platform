import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  clearFailures,
  clientKey,
  isThrottled,
  recordFailure,
} from "@/lib/loginThrottle";
import { safeRedirect } from "@/lib/safeRedirect";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  getSessionSecret,
  timingSafeEqualString,
} from "@/lib/session";

/**
 * Eidos Admin — login POST.
 *
 * Validates the submitted token against EIDOS_ADMIN_PASSWORD (constant
 * time). On match, sets an HttpOnly cookie holding a signed, expiring
 * session token — NOT the password — and redirects to `next`, which is
 * restricted to same-origin relative paths. On miss, redirects back to
 * /login with an error flag. Repeated misses from one client are
 * throttled.
 *
 * Distinct from EIDOS_ADMIN_API_TOKEN — that one is held by the
 * server, never reaches the browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminPassword = process.env.EIDOS_ADMIN_PASSWORD;
  const sessionSecret = getSessionSecret();
  if (!adminPassword || !sessionSecret) {
    return redirect(req, "/login?error=unconfigured");
  }

  const key = clientKey(req.headers);
  if (isThrottled(key)) {
    return redirect(req, "/login?error=throttled");
  }

  const form = await req.formData().catch(() => null);
  const submitted =
    form && typeof form.get("token") === "string"
      ? (form.get("token") as string)
      : "";
  const next = safeRedirect(
    form && typeof form.get("next") === "string"
      ? (form.get("next") as string)
      : null,
  );
  const nextQuery = `next=${encodeURIComponent(next)}`;

  if (!submitted) {
    return redirect(req, `/login?error=missing&${nextQuery}`);
  }

  if (!(await timingSafeEqualString(submitted, adminPassword))) {
    recordFailure(key);
    return redirect(req, `/login?error=invalid&${nextQuery}`);
  }

  clearFailures(key);
  const response = redirect(req, next);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionToken(sessionSecret),
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

function redirect(req: NextRequest, location: string): NextResponse {
  return NextResponse.redirect(new URL(location, req.url), { status: 303 });
}
