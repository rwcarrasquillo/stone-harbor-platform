import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Eidos Admin — login POST.
 *
 * Validates the submitted token against EIDOS_ADMIN_PASSWORD. On
 * match, sets an HttpOnly cookie containing the password itself and
 * redirects to `next` (sanitised). On miss, redirects back to /login
 * with an error flag.
 *
 * The cookie is the credential. HttpOnly + Secure + SameSite=Lax.
 * Distinct from EIDOS_ADMIN_API_TOKEN — that one is held by the
 * server, never reaches the browser. This one is held by the
 * browser, never reaches the engine. Two-layer separation.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "eidos_admin_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  const adminPassword = process.env.EIDOS_ADMIN_PASSWORD;
  if (!adminPassword) {
    return redirect(req, "/login?error=unconfigured");
  }

  const form = await req.formData().catch(() => null);
  const submitted =
    form && typeof form.get("token") === "string"
      ? (form.get("token") as string)
      : "";
  const nextRaw =
    form && typeof form.get("next") === "string"
      ? (form.get("next") as string)
      : "/";

  if (!submitted) {
    return redirect(req, `/login?error=missing&next=${encodeURIComponent(nextRaw)}`);
  }

  if (submitted !== adminPassword) {
    return redirect(req, `/login?error=invalid&next=${encodeURIComponent(nextRaw)}`);
  }

  const next = sanitizeNext(nextRaw);
  const response = redirect(req, next);
  response.cookies.set({
    name: COOKIE_NAME,
    value: adminPassword,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

function redirect(req: NextRequest, location: string): NextResponse {
  return NextResponse.redirect(new URL(location, req.url), { status: 303 });
}

function sanitizeNext(next: string): string {
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}
