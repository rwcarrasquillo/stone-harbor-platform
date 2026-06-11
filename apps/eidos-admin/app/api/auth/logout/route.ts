import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Eidos Admin — logout POST.
 *
 * Clears the session cookie and bounces to /login?logged_out=1.
 * POST (not GET) so link-prefetchers can't accidentally log you out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "eidos_admin_session";

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?logged_out=1", req.url),
    { status: 303 },
  );
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
