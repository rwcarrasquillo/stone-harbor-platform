import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Eidos Admin — session middleware.
 *
 * Gates everything except /login and /api/auth/* via the HttpOnly
 * session cookie set by the login route. Missing/invalid cookie on a
 * protected URL → 303 redirect to /login?next=<original>.
 *
 * The whole app is the admin surface, so there's no `/admin/` prefix
 * to match — matcher is "everything except the public login flow."
 */

const COOKIE_NAME = "eidos_admin_session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const adminPassword = process.env.EIDOS_ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.redirect(
      new URL("/login?error=unconfigured", req.url),
      { status: 303 },
    );
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === adminPassword) {
    return NextResponse.next();
  }

  const nextParam = encodeURIComponent(`${pathname}${search}`);
  return NextResponse.redirect(
    new URL(`/login?next=${nextParam}`, req.url),
    { status: 303 },
  );
}

/**
 * Match everything except Next's internals. The PUBLIC_PATHS check
 * inside the function lets the login + auth routes through.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.svg$).*)",
  ],
};
