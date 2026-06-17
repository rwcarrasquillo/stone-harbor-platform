"use client";

import { useId } from "react";

type Props = {
  /** Explicit pixel size. If omitted, the SVG fills 100% of its parent. */
  size?: number;
  /** Extra classes applied to the SVG. */
  className?: string;
  /** Optional fill color override. Defaults to gold-bright #c4934e. */
  fill?: string;
  /**
   * Vertical shaft length in viewBox units. Default 38 (the favicon's
   * shaft length, extended slightly past the bottom triangle point).
   *
   * Most surfaces use the default. The journal-preview EntryTailpiece
   * passes a larger value (42) so the fleuron — which sits inside a
   * generous banner of negative space — reads as a more elongated,
   * more deliberate harbor mark than the compact top-header anchor.
   * The bottom of the shaft extends further past the triangle point;
   * the rest of the silhouette stays identical so the brand mark is
   * still recognizable.
   */
  shaftHeight?: number;
};

/**
 * Stone Harbor — Anchor brand mark.
 *
 * Single source of truth for the Stone Harbor anchor silhouette.
 * Matches favicon-anchor.svg proportions exactly — hollow ring at top,
 * crossbar, two curved flukes at the bottom that wrap up from the
 * bottom point. The shaft was extended (height 29 → 34) so the rod
 * visibly continues through the bottom triangle point instead of
 * appearing cut off at the seam.
 *
 * Used in:
 *   - Journal preview top header (size=32)
 *   - Global crisis footer breathing anchor (via h-9/h-10 wrapper)
 *   - Future: every other authenticated surface header that needs
 *     brand-mark presence.
 *
 * Mask id uniqueness:
 *   The ring-hole is rendered via an SVG <mask>. If the same component
 *   is mounted multiple times on a page (e.g., top header + footer),
 *   the masks must have unique ids or the url(#…) references collide
 *   and the bottom one renders incorrectly. useId() provides a stable
 *   per-instance id that survives SSR + hydration. The colons React
 *   includes in useId() values are stripped because some browsers
 *   treat them as URL scheme separators inside url(#…).
 */
export function AnchorMark({
  size,
  className = "",
  fill = "#c4934e",
  shaftHeight = 38,
}: Props) {
  const reactId = useId();
  const maskId = `sh-anchor-mask-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={size ? className : `h-full w-full ${className}`}
    >
      <defs>
        <mask id={maskId}>
          <rect width="64" height="64" fill="white" />
          {/* Inner ring hole — transparent in the rendered output. */}
          <circle cx="32" cy="14" r="1.7" fill="black" />
        </mask>
      </defs>
      <g fill={fill} mask={`url(#${maskId})`}>
        {/* Outer ring */}
        <circle cx="32" cy="14" r="4" />
        {/* Vertical shaft — default height 38 (from favicon's 29 → 34 →
            38) so the rod visibly continues past the bottom triangle
            point. The shaft ends at y = 17.8 + shaftHeight; with default
            38 that's y=55.8, ~5 units past the point apex (y=51), reading
            as a full anchor not a clipped one.

            Overridable via the shaftHeight prop. The fleuron uses 42 to
            extend the rod another 4 units, lending the harbor mark more
            verticality in the wide tailpiece banner. */}
        <rect
          x="30.6"
          y="17.8"
          width="2.8"
          height={shaftHeight}
          rx="0.5"
        />
        {/* Crossbar */}
        <rect x="21" y="24.5" width="22" height="2.6" rx="0.5" />
        {/* Left curved fluke */}
        <path d="M11.5 36 Q 11.5 51 22 51 L 22 47.5 Q 16 47.5 15.5 39.5 Z" />
        {/* Right curved fluke */}
        <path d="M52.5 36 Q 52.5 51 42 51 L 42 47.5 Q 48 47.5 48.5 39.5 Z" />
        {/* Bottom triangle point */}
        <path d="M28.5 46.5 L 32 51 L 35.5 46.5 Z" />
      </g>
    </svg>
  );
}
