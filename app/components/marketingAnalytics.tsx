"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Authenticated route prefixes. Analytics events for any of these are
 * dropped via the beforeSend callback before being transmitted, so
 * Vercel Web Analytics only ever sees the marketing / pre-auth surface
 * of the app.
 *
 * This implements Stone Harbor's privacy promise: anonymous marketing
 * visitors get aggregate pageview counts; signed-in members are never
 * tracked by external analytics (member behavior is captured separately
 * by MemberUsageTracker, which writes to our own RLS-protected tables
 * and never leaves the platform).
 *
 * When adding a new authenticated route, add its top-level prefix here.
 * When adding a new public/pre-auth route (privacy, terms, crisis-
 * resources, marketing landing pages, /register variants, etc.), it is
 * tracked by default — no change to this list is required.
 */
const AUTHENTICATED_PATH_PREFIXES = [
  "/dashboard",
  "/journal",
  "/vent",
  "/messages",
  "/members-blog",
  "/welcome",
  "/meditation",
  "/resources",
  "/map",
  "/start-here",
  "/roadmap",
  "/suspended",
];

/**
 * Strip a locale prefix (/en, /es) from a pathname so that the
 * authenticated-route check works regardless of which locale segment
 * the request is under. Example: "/en/dashboard" -> "/dashboard".
 */
function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(en|es)(?=\/|$)/, "");
}

function isAuthenticatedRoute(url: string): boolean {
  try {
    const path = stripLocalePrefix(new URL(url).pathname);
    return AUTHENTICATED_PATH_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
  } catch {
    // Malformed URL — fail closed (do NOT send the event). Safer than
    // tracking something we can't categorize.
    return true;
  }
}

/**
 * Vercel Web Analytics scoped to public / marketing routes only.
 *
 * The Analytics component is mounted once in the root layout, but the
 * beforeSend callback drops any event whose URL maps to an authenticated
 * member route. Result: only anonymous marketing-funnel pageviews reach
 * Vercel, in line with Stone Harbor's "members are not tracked" promise
 * (documented in `Stone_Harbor_Privacy_Policy.md` §2.3 and §3).
 *
 * Mounted alongside other client-side instrumentation in the root
 * layout (MemberUsageTracker, ServiceWorkerRegistrar, etc.).
 */
export function MarketingAnalytics() {
  return (
    <Analytics
      beforeSend={(event) => {
        if (isAuthenticatedRoute(event.url)) return null;
        return event;
      }}
    />
  );
}
