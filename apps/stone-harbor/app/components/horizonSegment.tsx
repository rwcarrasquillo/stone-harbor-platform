"use client";

/**
 * Stone Harbor — engraved-gold horizon segment.
 *
 * One half of the horizon mark — a horizontal hairline that fades to
 * transparent at its outer (page-edge) end and stays confident at its
 * inner end where it meets the anchor.
 *
 * The original implementation was an SVG asymmetric lens path
 * (pointed at the outer end, blunt at the inner end). That worked
 * at small sizes but pixelated on wider containers — same root
 * cause as the HairlineLens issue. This CSS version renders as a
 * 1px-tall span with a linear-gradient fill and a theme-dependent
 * filter drop-shadow. A pixel-grid-aligned 1px line can't pixelate.
 *
 * The visual result is a thinner, more delicate horizon than the
 * old SVG lens — but it matches the CSS horizon already shipped on
 * /journal/archive, /lineage, /roadmap, /resources, /members-blog.
 * Consistency across all surfaces beats the heavier lens look on
 * three of them.
 *
 * Direction:
 *   `left` — gradient runs transparent (outer/left) → confident (inner/right)
 *   `right` — mirrored
 */
export function HorizonSegment({
  direction,
  goldRgb,
  lineAlphaInner,
  lineAlphaMid,
  filter,
}: {
  direction: "left" | "right";
  /** RGB triplet of the gold accent, e.g. "169,121,61" (sunlit deep)
   *  or "196,147,78" (dusk bright). Caller picks based on theme. */
  goldRgb: string;
  /** Alpha at the inner (anchor-facing) end. Typically ~0.95 sunlit,
   *  ~0.85 dusk. */
  lineAlphaInner: number;
  /** Alpha at the gradient's mid stop. Typically ~0.5 sunlit, ~0.4 dusk. */
  lineAlphaMid: number;
  /** CSS filter string — usually theme-dependent drop-shadow(s).
   *  Sunlit: a tight dark drop-shadow reads as ink impression.
   *  Dusk: stacked outward gold halos read as a focused beam. */
  filter: string;
}) {
  const innerColor = `rgba(${goldRgb},${lineAlphaInner})`;
  const midColor = `rgba(${goldRgb},${lineAlphaMid})`;
  const midSoftColor = `rgba(${goldRgb},${lineAlphaMid * 0.6})`;
  const transparent = `rgba(${goldRgb},0)`;

  // Five-stop gradient ladder matches the original SVG's stop pattern
  // (0% / 22% / 55% / 88% / 100%) so the perceived taper is identical
  // to the asymmetric lens, minus the geometric thickness variation.
  const background =
    direction === "left"
      ? `linear-gradient(to right, ${transparent} 0%, ${midSoftColor} 22%, ${midColor} 55%, ${innerColor} 88%, ${innerColor} 100%)`
      : `linear-gradient(to right, ${innerColor} 0%, ${innerColor} 12%, ${midColor} 45%, ${midSoftColor} 78%, ${transparent} 100%)`;

  return (
    <span
      aria-hidden="true"
      className="block h-px flex-1"
      style={{
        background,
        filter,
      }}
    />
  );
}
