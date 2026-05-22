"use client";

import { useEffect, useState } from "react";
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
 * Mobile scroll behaviour:
 *   On phones the harbor pages scroll a lot, and a stationary
 *   anchor at full size starts to feel like it's competing with
 *   the content the further down you go. The fix: the anchor
 *   begins at its full 260px presence on the first screen, then
 *   gradually scales down toward the corner as the page is
 *   scrolled. The transform anchors to `bottom right` so the
 *   "bleed-off" corner stays pinned and the shape recedes into
 *   the lower-right rather than wandering. On desktop (md+) the
 *   anchor stays at its full size — desktop layouts already give
 *   it plenty of visual room.
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

// Scroll distance over which the anchor shrinks from full → minimum,
// and the floor scale. 480px feels right on a typical phone — the
// member has scrolled past the first card stack by the time the
// anchor has settled into its smaller corner pose.
const SHRINK_DISTANCE = 480;
const MIN_SCALE = 0.45;

export function AnchorWatermark() {
  const pathname = usePathname() || "/";
  const [scrollProgress, setScrollProgress] = useState(0); // 0..1
  const [isMobile, setIsMobile] = useState(false);

  // Track the viewport width so we only animate on phones. Desktop
  // (>=768px / Tailwind md) keeps the anchor static at full size.
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // rAF-throttled scroll listener. Only runs while mobile is true so
  // desktop pays nothing for this effect.
  useEffect(() => {
    if (!isMobile) {
      setScrollProgress(0);
      return;
    }
    let rafId = 0;
    const handler = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const y = window.scrollY;
        const t = Math.min(1, Math.max(0, y / SHRINK_DISTANCE));
        setScrollProgress(t);
      });
    };
    // Seed once so a page that opens mid-scroll (back-nav, anchor
    // links) reflects the correct size on first paint.
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isMobile]);

  if (pathname === "/") return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Linear interpolation 1 → MIN_SCALE.
  const scale = isMobile ? 1 - (1 - MIN_SCALE) * scrollProgress : 1;

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
        // Tuned down from 260px so the full-size pose at scroll-top
        // doesn't crowd the breathing circle on the dashboard's
        // reflection card. The scroll-driven shrink still ends at
        // ~90px, which reads as a small corner mark.
        width: "200px",
        height: "200px",
        // Anchor the scale to the bottom-right so the corner-bleed
        // stays pinned and the shape recedes inward instead of
        // floating away from the edge.
        transform: `scale(${scale})`,
        transformOrigin: "bottom right",
        // Smooth the per-frame scale jumps. ~280ms feels like a
        // settle, not a snap. Desktop has scale 1 always so this
        // transition is effectively a no-op there.
        transition: "transform 280ms ease-out",
        willChange: isMobile ? "transform" : undefined,
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
