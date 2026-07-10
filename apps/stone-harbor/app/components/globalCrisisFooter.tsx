"use client";

import { usePathname } from "next/navigation";
import { CrisisFooter } from "./crisisFooter";

/**
 * Stone Harbor — GlobalCrisisFooter.
 *
 * Renders the CrisisFooter at the body level (sibling of {children}
 * in layout.tsx) instead of inside each page's <main>. Using the
 * pathname, this component decides which routes get the footer and
 * which (if any) get the `amplify988` variant.
 *
 * Why body-level placement instead of per-page mounting:
 *
 *   Pages historically each rendered their own <CrisisFooter /> at
 *   the bottom of their <main>. That works visually most of the time,
 *   but parent constraints on <main> — horizontal padding (welcome's
 *   `px-4 md:px-8`), `overflow-hidden` on the ambient backdrop, or
 *   `max-w-*` wrappers — could either narrow the band or clip the
 *   viewport-width breakout CSS the footer relied on. Symptom: the
 *   band failed to reach both edges of the screen, and didn't sit
 *   flush with the viewport bottom on short pages.
 *
 *   Rendering the footer as a direct child of <body> (which is
 *   `flex min-h-screen flex-col` in layout.tsx) eliminates all
 *   per-page parent quirks. The footer is naturally 100vw because
 *   body is 100vw. It naturally sits at the bottom of the viewport
 *   because the {children} wrapper has flex-1 and the footer is its
 *   trailing sibling. No CSS tricks required.
 *
 * Visibility rules:
 *   - Auth, informational, and locked-out surfaces (/, /login,
 *     /register, /forgot-*, /reset-*, /terms, /privacy, /about,
 *     /onboarding, /suspended, /offline) — NO footer; those pages
 *     have their own footer treatment (LanguagePicker, marketing
 *     wordmark, etc.) or are states where 988 can't function.
 *   - Every other member-facing surface — including /start-here and
 *     the Map wizard surfaces — shows the standard footer. See the
 *     HIDDEN_PREFIXES comment below for the reasoning.
 *
 * Note on the `amplify988` variant:
 *   The dashboard previously rendered the footer with `amplify988`
 *   driven by its `acknowledgment` context (a heavy-day signal like
 *   Father's Day). With body-level mounting, that contextual signal
 *   no longer reaches the footer through props. The amplified line
 *   can be reintroduced later via a context/store if desired — for
 *   now the global footer always shows the unamplified variant for
 *   consistency across pages.
 */

// Prefixes where the crisis footer should NOT render. These are
// pre-authenticated or locked-out surfaces where the 988 anchor is
// either handled differently (auth-flow footer with its own
// treatment) or doesn't make sense (offline state can't reach 988;
// suspended state is a locked notice, not an active member surface).
//
// Every authenticated member-facing surface — including the Map
// wizard surfaces (/map/begin, /map/week/[n]) — carries the crisis
// footer. The in-flow CrisisModal on the wizard surfaces responds to
// specific distress signals in the member's answers; the crisis
// footer is a persistent anchor for any moment the member needs to
// reach 988 immediately, regardless of what they've answered.
// Belt-and-suspenders — 2026-07-09 founder directive.
//
// /start-here is excluded from this list for the same reason, and it
// applies there even more strongly than on the authenticated wizard
// surfaces: it's the pre-auth healing quiz whose answer options are
// distress signals ("I feel angry", "I feel overwhelmed"), and a
// visitor may have arrived precisely because they're in acute distress.
//
// /onboarding stays listed but is moot — it's a server-component shim
// that redirects to /settle-in, so no footer renders either way. Kept
// as self-documenting configuration.
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/about",
  "/onboarding",
  "/suspended",
  "/offline",
  // Public marketing surfaces (/, /en, /es) handle their own footer
  // via the LanguagePicker component. We still hide here because the
  // root path "/" needs to be excluded explicitly below.
];

export function GlobalCrisisFooter() {
  const pathname = usePathname() || "/";

  // Root paths — public marketing surfaces under "/" and the locale
  // segments "/en" and "/es" — handle their own footer.
  if (pathname === "/" || pathname === "/en" || pathname === "/es") {
    return null;
  }

  // Locale-prefixed public surfaces (e.g., /en/login, /es/login).
  for (const prefix of HIDDEN_PREFIXES) {
    if (pathname.startsWith(prefix)) return null;
    if (pathname.startsWith(`/en${prefix}`)) return null;
    if (pathname.startsWith(`/es${prefix}`)) return null;
  }

  return <CrisisFooter />;
}
