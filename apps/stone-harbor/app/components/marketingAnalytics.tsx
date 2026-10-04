"use client";

import { Analytics } from "@vercel/analytics/next";

/**
 * Public marketing routes: the ONLY pages Vercel Web Analytics may see
 * (SH-160, review finding 10). This used to be a denylist of member routes,
 * and new member pages (/practice, /lineage, /settle-in, /rhythm…) silently
 * escaped it. An allowlist fails closed: a new page is private until it's
 * deliberately added here.
 *
 * Exact matches only (after stripping /en or /es). Members are never
 * tracked by external analytics; member behavior is captured separately by
 * MemberUsageTracker, which writes to our own RLS-protected tables.
 */
const PUBLIC_MARKETING_PATHS = new Set([
  "/",
  "/about",
  "/crisis-resources",
  "/privacy",
  "/terms",
  "/register",
  "/login",
  "/forgot-password",
  "/keepers",
]);

/**
 * Strip a locale prefix (/en, /es) from a pathname so that the
 * authenticated-route check works regardless of which locale segment
 * the request is under. Example: "/en/dashboard" -> "/dashboard".
 */
function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(en|es)(?=\/|$)/, "");
}

/** Returns the event URL without query/hash if it's a public marketing
 *  page, or null if the event must not be sent. */
function publicMarketingUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = stripLocalePrefix(u.pathname) || "/";
    if (!PUBLIC_MARKETING_PATHS.has(path)) return null;
    // Query strings can carry tokens or identifiers; never send them.
    return `${u.origin}${u.pathname}`;
  } catch {
    // Malformed URL — fail closed.
    return null;
  }
}

/**
 * Vercel Web Analytics scoped to public / marketing routes only.
 *
 * The Analytics component is mounted once in the root layout, but the
 * beforeSend callback drops any event whose URL isn't an allowlisted
 * public marketing page. Result: only anonymous marketing-funnel pageviews reach
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
        const url = publicMarketingUrl(event.url);
        return url ? { ...event, url } : null;
      }}
    />
  );
}
