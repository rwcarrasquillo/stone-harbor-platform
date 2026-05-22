"use client";

import { usePathname } from "next/navigation";

/**
 * Stone Harbor — AnchorWatermark.
 *
 * A large, faded anchor positioned to bleed off the lower-right
 * corner of every authenticated page. Lives in the background as
 * brand presence — visible enough to feel grounding, subliminal
 * enough never to compete with content.
 *
 * Design rationale:
 *   A small corner mark would have been easy to miss AND would
 *   collide with the mobile tab bar. A large anchor that's mostly
 *   off-screen, sitting in the lower-right region with ~30% of the
 *   shape clipped, reads as "the page is anchored here." The
 *   member's eye registers the brand mark in their peripheral
 *   vision without it ever becoming the subject.
 *
 *   Positioned ABOVE the mobile tab bar zone so it doesn't clip
 *   behind navigation. On desktop where the tab bar is hidden,
 *   the anchor reaches closer to the actual viewport bottom.
 *
 * Theme-aware:
 *   Stroke is the canonical brand gold (#c4934e) and the opacity
 *   is tuned so it reads against both the cream Sunlit surface
 *   and the dark Dusk amniotic field. CSS custom properties
 *   inherit from the html[data-theme] context.
 *
 * Hidden on public/auth/wizard routes and on focused experiences
 * (/meditation, /vent) where any extra mark would crack the
 * containment.
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
  "/join",
  "/onboarding",
  "/suspended",
  "/offline",
  "/meditation",
  "/vent",
];

export function AnchorWatermark() {
  const pathname = usePathname() || "/";

  if (pathname === "/") return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-0 opacity-[0.09]"
      style={{
        // Lower-right region with ~30% of the anchor bleeding off the
        // page edge. Push UP above the mobile tab bar (which is ~64px
        // tall + safe-area). On md+ the tab bar is hidden so we sit
        // closer to the actual viewport corner.
        right: "-6%",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
        width: "260px",
        height: "260px",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c4934e"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-full w-full md:opacity-100"
        style={{ overflow: "visible" }}
      >
        {/* Stylized anchor mirroring the brand favicon glyph */}
        <circle cx="12" cy="5" r="1.5" />
        <path d="M12 22V8" />
        <path d="M5 12a7 7 0 0 0 14 0" />
        <path d="M8 8h8" />
      </svg>
    </div>
  );
}

/**
 * Optional: a desktop-only larger version of the anchor positioned
 * farther bottom-right. Currently unused — the main watermark above
 * works for both viewports. Reserved for a future "extra atmospheric
 * brand presence on wide displays" iteration if desired.
 */

