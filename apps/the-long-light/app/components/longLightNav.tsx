"use client";

/**
 * LongLightNav — shared chrome for the signed-in member experience.
 *
 * Two layouts off one source of truth (NAV_ITEMS):
 *   - Desktop (≥768px): a top horizontal bar. Mark top-left, the five
 *     destinations centered, sign-out top-right. Active page carries a
 *     subtle Hearth-honey underline.
 *   - Mobile (<768px): a top bar with the mark centered and a "More"
 *     overflow (holds sign-out), plus a fixed bottom tab bar with the
 *     five destinations as icon + label. Active tab gets a honey dot.
 *
 * Skeleton-stage note: the labels here ("The Map", "Welcome") are
 * structural, not final voice — but nav labels are navigational
 * affordances, not editorial copy, so they're intentionally NOT wrapped
 * in DraftPlaceholder. If the editorial cofounder wants different
 * section names, they change in one place: NAV_ITEMS.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { LongLightMark } from "@/app/components/longLightMark";

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
};

function iconStroke(active: boolean) {
  return active ? "var(--primary)" : "var(--text-secondary)";
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={iconStroke(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9h14v-9" />
      </svg>
    ),
  },
  {
    href: "/journal",
    label: "Journal",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={iconStroke(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 4h11l3 3v13H5z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "The Map",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={iconStroke(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z" />
        <path d="M9 4v14M15 6v14" />
      </svg>
    ),
  },
  {
    href: "/resources",
    label: "Resources",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={iconStroke(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 7c-1.5-1.5-4-2-6-1.5V18c2-.5 4.5 0 6 1.5 1.5-1.5 4-2 6-1.5V5.5c-2-.5-4.5 0-6 1.5z" />
        <path d="M12 7v12.5" />
      </svg>
    ),
  },
  {
    href: "/welcome",
    label: "Welcome",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke={iconStroke(active)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v3M12 6a6 6 0 0 1 6 6c0 3-1.5 4.5-1.5 6h-9C7.5 16.5 6 15 6 12a6 6 0 0 1 6-6z" />
        <path d="M9.5 21h5" />
      </svg>
    ),
  },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LongLightNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Desktop top bar */}
      <header className="hidden border-b border-[var(--background-recessed)] bg-[var(--background-base)] md:block">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="The Long Light — home">
            <LongLightMark className="h-8 w-8" />
            <span className="font-serif text-base text-[var(--primary)]">The Long Light</span>
          </Link>

          <ul className="flex items-center gap-7">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`relative font-sans text-sm tracking-wide transition-colors ${
                      active
                        ? "text-[var(--primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--primary)]"
                    }`}
                  >
                    {item.label}
                    {active ? (
                      <span className="absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full bg-[var(--accent-long-light)]" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={handleSignOut}
            className="font-sans text-sm text-[var(--text-secondary)] underline underline-offset-2 transition-colors hover:text-[var(--primary)]"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile top bar */}
      <header className="relative flex items-center justify-center border-b border-[var(--background-recessed)] bg-[var(--background-base)] px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="The Long Light — home">
          <LongLightMark className="h-7 w-7" />
          <span className="font-serif text-sm text-[var(--primary)]">The Long Light</span>
        </Link>
        <div className="absolute right-3">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-label="More"
            className="rounded-sm px-2 py-1 font-sans text-sm text-[var(--text-secondary)]"
          >
            More
          </button>
          {moreOpen ? (
            <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-sm border border-[var(--background-recessed)] bg-[var(--background-base)] py-1 shadow-md">
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full px-3 py-2 text-left font-sans text-sm text-[var(--text-secondary)] hover:bg-[var(--background-recessed)]"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-[var(--background-recessed)] bg-[var(--background-base)] md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-2"
            >
              {item.icon(active)}
              <span
                className={`font-sans text-[10px] ${
                  active ? "text-[var(--primary)]" : "text-[var(--text-secondary)]"
                }`}
              >
                {item.label}
              </span>
              {active ? (
                <span className="absolute top-1 h-1 w-1 rounded-full bg-[var(--accent-long-light)]" />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
