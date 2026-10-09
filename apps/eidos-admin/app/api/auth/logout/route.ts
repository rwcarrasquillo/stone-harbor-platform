import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";

/**
 * Eidos Admin — logout POST.
 *
 * Clears the session cookie and bounces to /login?logged_out=1.
 * POST (not GET) so link-prefetchers can't accidentally log you out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(
    new URL("/login?logged_out=1", req.url),
    { status: 303 },
  );
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
