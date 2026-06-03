"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMemberPageView } from "@/lib/memberUsage";

/**
 * Stone Harbor — MemberUsageTracker.
 *
 * Mounted once in the root layout. Watches the App Router's
 * pathname and fires a member_page_views insert whenever the
 * member navigates to a new route — including in-app
 * navigation between pages (which middleware would otherwise
 * miss because Next never round-trips to the server for them).
 *
 * We intentionally skip the following routes:
 *   - /login, /register, /forgot-password, /reset-password,
 *     /join, /onboarding, /suspended, /privacy, /terms, /offline,
 *     /about — these are pre-auth or static and not useful for
 *     understanding member behavior. trackMemberPageView itself
 *     also bails out when there's no signed-in user, so this
 *     prefix list is purely a small optimization.
 *
 * Renders nothing.
 */

const SKIP_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/join",
  "/onboarding",
  "/suspended",
  "/privacy",
  "/terms",
  "/offline",
  "/about",
];

export function MemberUsageTracker() {
  const pathname = usePathname();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
      prevRef.current = pathname;
      return;
    }
    trackMemberPageView(pathname, prevRef.current);
    prevRef.current = pathname;
  }, [pathname]);

  return null;
}
