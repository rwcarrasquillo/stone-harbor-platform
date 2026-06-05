import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — locale middleware.
 *
 * Stone Harbor uses a hybrid routing model:
 *   - Phase 1 pages live under app/[locale]/* and carry an explicit
 *     locale segment in the URL (e.g. /en/login, /es/map). next-intl
 *     handles these.
 *   - Phase 2 pages live at the root (/dashboard, /journal, etc.) and
 *     resolve locale at request time from the NEXT_LOCALE cookie,
 *     read in i18n/request.ts. No locale segment in the URL.
 *
 * Without this guard, a request to a Phase 2 path WITH a locale
 * prefix — e.g. someone bookmarks or types /es/roadmap — flows
 * through next-intl's middleware which tries to render
 * app/[locale]/roadmap/page.tsx, which doesn't exist, and the user
 * lands on the 404 ("Not part of the harbor") page.
 *
 * Fix: detect /(en|es)/<phase-2-page> in the middleware and 308
 * redirect to the unprefixed canonical path. Locale resolution still
 * works (the NEXT_LOCALE cookie carries the user's preference) and
 * the URL the member shares is always the canonical one.
 *
 * The list of Phase 2 pages is hand-maintained here. Adding a new
 * authenticated page that lives outside [locale] means appending its
 * top-level segment to PHASE_2_PAGES below.
 */
const PHASE_2_PAGES = new Set([
  "dashboard",
  "journal",
  "messages",
  "members-blog",
  "resources",
  "roadmap",
  "welcome",
  "settle-in",
  "meditation",
  "vent",
  "founder",
  "admin", // legacy admin redirect — keep until /admin is fully removed
  "admins", // admin-group management lives at /admins
  "audit-log",
  "media",
  "prompts",
  "security",
  "settings",
  "tests",
  "external",
  "moderation",
  // public root pages without [locale] counterparts — must redirect
  // when locale-prefixed (otherwise /(en|es)/<page> falls through to
  // next-intl and 404s on the missing app/[locale]/<page>/page.tsx)
  "join",
  "about",
  "start-here",
  "onboarding",
  "suspended",
  // public auth pages without [locale] counterparts — same fall-through
  // 404 as above when locale-prefixed (no app/[locale]/<page>/page.tsx)
  "register",
  "forgot-password",
  "reset-password",
  "privacy",
  "terms",
]);

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const match = pathname.match(/^\/(en|es)\/([^/]+)/);
  if (match && PHASE_2_PAGES.has(match[2])) {
    // Strip the locale prefix and 308-redirect to the canonical URL.
    // The NEXT_LOCALE cookie already carries the user's preference;
    // the redirect doesn't lose locale state.
    const stripped = pathname.replace(/^\/(en|es)/, "");
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 308);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/",
    "/(en|es)/:path*",
    // /login keeps an explicit entry: it has a real app/[locale]/login
    // page, so next-intl rendering /en/login is correct.
    "/login",
    // NOTE: register, forgot-password, reset-password, privacy and terms
    // are deliberately NOT matched here. They only exist as root pages
    // (app/<page>/page.tsx, no [locale] counterpart). With
    // localePrefix:"always", matching the unprefixed path would make
    // next-intl 307 it to /en/<page>, which the PHASE_2_PAGES guard then
    // 308s back to /<page> — an infinite loop. Leaving them out of the
    // matcher lets the canonical /<page> serve directly, while the
    // /(en|es)/:path* entry still catches /en/<page> for the 308 strip.
  ],
};
