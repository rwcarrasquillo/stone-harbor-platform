import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  classifyPath,
  decideAccess,
  toAssuranceLevel,
  type AssuranceLevel,
} from "@/lib/adminAccess";
import { SESSION_COOKIE_OPTIONS, getSupabaseConfig } from "@/lib/supabase/config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Eidos Admin — session middleware.
 *
 * Every request outside the public login paths must carry a Supabase
 * session that is (1) valid — checked against Supabase Auth on each
 * request, so revoking a session takes effect immediately, (2) owned by
 * an active row in eidos_admin_users, and (3) MFA-verified (aal2). See
 * lib/adminAccess.ts for the rules. Anything less is sent to /login, or to
 * the TOTP step.
 *
 * The matcher covers everything except Next internals and static assets.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const pathClass = classifyPath(pathname);
  if (pathClass === "public") return NextResponse.next();

  const config = getSupabaseConfig();
  if (!config) return redirectTo(req, "/login?error=unconfigured");

  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS }),
        );
      },
    },
  });

  // getUser() validates the token with Supabase Auth (and refreshes it if
  // expired). It must be the first auth call after creating the client.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let currentLevel: AssuranceLevel | null = null;
  let nextLevel: AssuranceLevel | null = null;
  if (user) {
    const [adminRow, aal] = await Promise.all([
      // RLS exposes only the caller's own, still-active row.
      supabase.from("eidos_admin_users").select("user_id").eq("user_id", user.id).maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    isAdmin = Boolean(adminRow.data);
    currentLevel = toAssuranceLevel(aal.data?.currentLevel);
    nextLevel = toAssuranceLevel(aal.data?.nextLevel);
  }

  const decision = decideAccess({
    pathClass,
    hasUser: Boolean(user),
    isAdmin,
    currentLevel,
    nextLevel,
  });

  if (decision.kind === "allow") return response;

  if (decision.clearSession) await supabase.auth.signOut({ scope: "local" });

  const target =
    decision.to === "/login" && pathClass === "protected"
      ? `/login?next=${encodeURIComponent(`${pathname}${search}`)}`
      : decision.to === "/login/mfa" || decision.to === "/login/enroll"
        ? `${decision.to}?next=${encodeURIComponent(`${pathname}${search}`)}`
        : decision.to;
  const redirect = redirectTo(req, target);
  // Carry over any refreshed / cleared session cookies.
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}

function redirectTo(req: NextRequest, location: string): NextResponse {
  return NextResponse.redirect(new URL(location, req.url), { status: 303 });
}

/**
 * Match everything except Next's internals. The path classification inside
 * the function lets the login routes through.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.svg$).*)",
  ],
};
