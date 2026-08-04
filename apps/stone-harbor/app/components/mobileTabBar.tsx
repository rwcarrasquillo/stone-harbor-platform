"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, BookOpen, MessageCircle, MoreHorizontal, User } from "lucide-react";
import { MobileMoreMenu } from "@/app/components/mobileMoreMenu";

/**
 * Stone Harbor — mobile tab bar.
 *
 * Fixed bottom navigation visible on phones only (sm:hidden). Five
 * slots: Home, Journal, Messages, More, Me. One tap from anywhere
 * to anywhere — the single highest-impact change for the "scroll
 * forever" feeling, because members never have to scroll back to a
 * nav link.
 *
 * SH-123 — the Roadmap tab gave up its slot to "More".
 *   Five slots, thirteen rooms: four tabs could never cover the harbor,
 *   so eight rooms had no path from the bottom nav at all. "More" opens
 *   a bottom sheet holding every one of them (see mobileMoreMenu.tsx),
 *   which makes the whole harbor two taps deep instead of leaving most
 *   of it reachable only by scrolling the dashboard's ten-card strip.
 *
 *   Roadmap is the safe slot to trade because it keeps three other
 *   doors: the "See the whole path →" link in the dashboard's
 *   CurrentStepPanel, the "Your path" card in the rooms strip, and its
 *   own entry in the More sheet. It loses one tap, not its reachability.
 *
 * Labels:
 *   The `tabBar.*` catalog keys have existed in both locales since the
 *   bar shipped, but the component hardcoded English strings and never
 *   read them — so Spanish members saw an English nav, and the
 *   Messages tab read "Messages" where the catalog says "Brotherhood"
 *   / "Hermandad". Wired up here.
 *
 * Pathname gate:
 *   Public + auth + wizard pages are excluded — the tab bar belongs
 *   to the member experience inside the harbor, not the front door.
 *   The exclusion list is conservative: if a path matches any prefix
 *   in HIDDEN_PREFIXES the bar disappears entirely.
 *
 * iPhone safe-area:
 *   On modern iPhones the home indicator sits in a 20–34px gutter
 *   below the visible viewport. We respect that gutter via
 *   env(safe-area-inset-bottom) so the tab labels never overlap the
 *   home indicator and the tap targets stay easy to hit.
 *
 * PWA standalone mode:
 *   When Stone Harbor is launched from the home screen (display:
 *   standalone), the safe-area variables resolve to the real iOS
 *   inset. The same component works in both Safari and PWA.
 *
 * Page content padding:
 *   Pages need ~5rem of bottom padding so the tab bar doesn't cover
 *   the last card. The globals.css rule `main { padding-bottom: ...}`
 *   handles this once for every page using a <main> element.
 *
 * Why client component:
 *   usePathname() is a client hook. The component renders to ~1.5kb
 *   and is mounted once at the root layout, so the cost is negligible.
 */

const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
  "/about",
  "/resources",
  // "/resources" does not cover this one — "/crisis-resources" doesn't
  // start with it. Listed explicitly (SH-105): the crisis page is a
  // public surface a signed-out visitor can land on, member tabs are
  // no use to them there, and the reclaimed height goes to the four
  // primary resources on mobile.
  "/crisis-resources",
  "/start-here",
  "/onboarding",
  "/settle-in",
  "/suspended",
  "/offline",
  "/meditation",
  "/vent",
];

// Treat the homepage as public — only show the bar once the member
// is past the front door.
const isPublicHome = (pathname: string) => pathname === "/";

type Tab = {
  /** `null` marks the sheet trigger — it opens the More menu, not a route. */
  href: string | null;
  /** Key under the `tabBar` catalog namespace. */
  labelKey: string;
  icon: typeof Home;
  /** Match this prefix to consider the tab active. */
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/dashboard",
    labelKey: "home",
    icon: Home,
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/"),
  },
  {
    href: "/journal",
    labelKey: "journal",
    icon: BookOpen,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/messages",
    labelKey: "messages",
    icon: MessageCircle,
    match: (p) => p.startsWith("/messages"),
  },
  {
    // Sheet trigger. Highlights when the member is standing in one of
    // the rooms the sheet holds, so "where am I" stays answerable from
    // the bar even for destinations that never had a tab.
    href: null,
    labelKey: "more",
    icon: MoreHorizontal,
    match: (p) =>
      [
        "/vent",
        "/meditation",
        "/roadmap",
        "/map",
        "/letters",
        "/resources",
        "/rhythm",
        "/lineage",
      ].some((prefix) => p.startsWith(prefix) || p.startsWith(`/en${prefix}`) || p.startsWith(`/es${prefix}`)),
  },
  {
    href: "/profile",
    labelKey: "me",
    icon: User,
    // /profile is the canonical destination; /welcome kept in the match
    // so the tab still highlights during the /welcome → /profile redirect.
    match: (p) => p.startsWith("/profile") || p.startsWith("/welcome"),
  },
];

export function MobileTabBar() {
  const pathname = usePathname() || "/";
  const t = useTranslations("tabBar");

  // The sheet's open state is stored as "which route was it opened on"
  // rather than a bare boolean, so that navigating anywhere closes it
  // for free — `openAt` stops matching `pathname` and the sheet is
  // derived shut.
  //
  // The room links inside the sheet already close it on tap, but that
  // does not cover browser back/forward, nor a member tapping through
  // to a HIDDEN_PREFIXES surface like /vent (where the whole bar
  // unmounts). With a boolean, the sheet would still be flagged open
  // and would spring back the moment they returned to the harbor.
  // Deriving it also keeps this off the effect-with-setState path the
  // react-hooks rule warns about.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const moreOpen = openAt !== null && openAt === pathname;
  const setMoreOpen = (next: boolean) => setOpenAt(next ? pathname : null);

  if (isPublicHome(pathname)) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <>
    <MobileMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    <nav
      aria-label="Primary"
      // Phones-only tab bar (< sm = 640px). Tablets at 640px+ get the
      // desktop layouts on every authenticated surface, so the bar
      // would just compete with the composer / horizon mark for
      // bottom-of-screen real estate. The bar is also hidden when
      // /messages sets `body[data-mobile-thread-overlay="true"]`
      // (Messenger thread overlay) — the in-panel "← Conversations"
      // link replaces the bar's back affordance there.
      // eslint-disable-next-line no-restricted-syntax -- bespoke always-dark surface: mobile tab bar stays near-black in both themes
      className="messenger-overlay-hidden sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-stone-800 bg-[#0A0A0B]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0B]/80"
      // Respect iOS home-indicator safe area
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.href === null ? moreOpen || tab.match(pathname) : tab.match(pathname);
          const Icon = tab.icon;
          // Shared between the Link tabs and the sheet-trigger button so
          // the five slots stay pixel-identical.
          const inner = (
            <>
              <Icon
                size={20}
                strokeWidth={active ? 2.25 : 1.75}
                aria-hidden="true"
              />
              <span>{t(tab.labelKey)}</span>
            </>
          );
          const className = `flex w-full flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
            active
              ? "text-[var(--sh-accent-gold-dusk)]"
              : "text-stone-500 hover:text-stone-200"
          }`;
          return (
            <li key={tab.labelKey} className="flex-1">
              {tab.href === null ? (
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  aria-expanded={moreOpen}
                  aria-haspopup="dialog"
                  style={{ outline: "none", outlineOffset: 0 }}
                  className={className}
                >
                  {inner}
                </button>
              ) : (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
    </>
  );
}
