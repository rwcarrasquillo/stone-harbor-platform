"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, MessageCircle, Compass, User } from "lucide-react";

/**
 * Stone Harbor — mobile tab bar.
 *
 * Fixed bottom navigation visible on mobile only (md:hidden). Five
 * tabs: Home, Journal, Messages, Roadmap, Me. One tap from anywhere
 * to anywhere — the single highest-impact change for the "scroll
 * forever" feeling, because members never have to scroll back to a
 * nav link.
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
  href: string;
  label: string;
  icon: typeof Home;
  /** Match this prefix to consider the tab active. */
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: Home,
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/"),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: BookOpen,
    match: (p) => p.startsWith("/journal"),
  },
  {
    href: "/messages",
    label: "Messages",
    icon: MessageCircle,
    match: (p) => p.startsWith("/messages"),
  },
  {
    href: "/roadmap",
    label: "Roadmap",
    icon: Compass,
    match: (p) => p.startsWith("/roadmap"),
  },
  {
    href: "/welcome",
    label: "Me",
    icon: User,
    match: (p) => p.startsWith("/welcome") || p.startsWith("/profile"),
  },
];

export function MobileTabBar() {
  const pathname = usePathname() || "/";

  if (isPublicHome(pathname)) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-stone-800 bg-[#0A0A0B]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0A0A0B]/80"
      // Respect iOS home-indicator safe area
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0)" }}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                  active
                    ? "text-[#c4934e]"
                    : "text-stone-500 hover:text-stone-200"
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden="true"
                />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
