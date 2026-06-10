import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Eidos Engine — admin Basic-Auth middleware (EID-21).
 *
 * Gates every request under `/admin/*` with HTTP Basic Auth against the
 * EIDOS_ADMIN_TOKEN env var. The browser handles credential prompting
 * and caching natively — no login UI to maintain, no cookies to manage,
 * no sessions to expire. Suits an internal-only single-admin surface
 * (Rafael today, eventual clinical advisor later).
 *
 * Auth format: `Authorization: Basic <base64(username:password)>`.
 * Username is ignored; password is compared against `EIDOS_ADMIN_TOKEN`.
 * Wrong/missing creds → 401 with `WWW-Authenticate: Basic realm="Eidos Admin"`
 * so the browser re-prompts.
 *
 * Runs in the Edge runtime; `atob` is available there.
 */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const adminToken = process.env.EIDOS_ADMIN_TOKEN;
  if (!adminToken) {
    // Misconfiguration — fail loud so it surfaces in logs. Don't return
    // 401 here, because that would prompt the browser indefinitely for
    // a credential that can never succeed.
    return new NextResponse(
      "EIDOS_ADMIN_TOKEN is not configured on this deployment.",
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  const match = auth?.match(/^Basic (.+)$/);
  if (match) {
    try {
      const decoded = atob(match[1]);
      // The colon splits username from password. We don't care which
      // username the operator types — any non-empty pair works.
      const colonIdx = decoded.indexOf(":");
      const password = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
      if (password === adminToken) {
        return NextResponse.next();
      }
    } catch {
      // Malformed base64 — falls through to 401 below.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Eidos Admin"' },
  });
}

/**
 * Limit the middleware to /admin/* — every other route (API ingestion,
 * cron, root health) is unchanged and untouched.
 */
export const config = {
  matcher: ["/admin/:path*"],
};
