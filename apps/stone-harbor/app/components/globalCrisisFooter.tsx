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
 *   - Public/auth/wizard surfaces (/, /login, /register, /forgot-*,
 *     /reset-*, /terms, /privacy, /about, /start-here, /join,
 *     /onboarding, /suspended, /offline) — NO footer; those pages
 *     have their own footer treatment (LanguagePicker, marketing
 *     wordmark, etc.) and don't need the 988 banner.
 *   - Authenticated surfaces — show the standard footer.
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

// Prefixes where the crisis footer should NOT render. These have
// their own footer treatments OR are mid-wizard surfaces where any
// extra band would crack the containment.
//
// On the Map: only the wizard surfaces (/map/begin, /map/week/[n])
// are hidden — those expose the BFI-10 / BPNSFS-12 instruments and
// surface a Crisis Modal in-flow instead of the 988 banner. The hub
// (/map) and the reader (/map/operating-manual) are passive destinations
// equivalent to /dashboard or /journal and should keep the footer +
// anchor like every other authenticated page. An earlier blanket
// "/map" entry suppressed both, which was the cause of the
// 2026-05-31 consistency complaint.
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/about",
  "/start-here",
  "/join",
  "/onboarding",
  "/suspended",
  "/offline",
  "/map/begin",
  "/map/week",
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
