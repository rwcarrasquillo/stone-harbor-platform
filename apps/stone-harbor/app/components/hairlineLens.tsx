"use client";

/**
 * Stone Harbor — engraved-gold hairline.
 *
 * The harbor's canonical active/selected/hovered accent. Renders as a
 * 1px-tall absolute-positioned span with a multi-stop linear-gradient
 * fill and a theme-dependent box-shadow. The optical metaphor mirrors
 * journal's earlier SVG-path version:
 *
 *   - Sunlit → engraved gold leaf pressed into cream paper. A tight
 *     dark drop-shadow reads as ink impression, not glow — cream paper
 *     can't carry a halo.
 *   - Dusk → luminous gold beam against near-black. A stacked outward
 *     gold halo reads as focused light bleeding into the surround.
 *
 * Why CSS gradient instead of SVG path lens:
 *   The original implementation drew an SVG `<path>` with pointed-oval
 *   tips. It rendered crisply on small navigation chips (≤94px tall,
 *   used on /journal entry strip) but pixelated on any taller container.
 *   The tips compress against the pixel grid at scale and read as
 *   jagged edges — exactly the artifact founder flagged on /roadmap
 *   stage tabs and step cards (2026-06-18). The fix is the same one
 *   shipped for /messages conversation cards: render the hairline as
 *   a 1px-tall div with CSS linear-gradient. A horizontal pixel-grid-
 *   aligned 1px line cannot pixelate by definition.
 *
 *   The gradient ladder (0% → 22% → 50% → 78% → 100%) tapers the
 *   alpha at both ends so the bar fades to transparent at the card
 *   edges. Visually identical to the SVG lens at small sizes; perfect
 *   at large sizes.
 *
 * Accent override:
 *   Pass `accentRgb` to render in pillar-specific colors (e.g.
 *   "169,121,61" for clarity/strength gold, "88,101,88" for calm moss).
 *   Default is the harbor brand gold: gold-deep on sunlit, gold-bright
 *   on dusk.
 *
 * Migration notes:
 *   This component used to import `useId` for a unique SVG gradient
 *   id. The CSS version doesn't need it — purely declarative. Any
 *   callers that imported the old SVG-based component continue to
 *   work with the same prop signature.
 */
export function HairlineLens({
  position,
  theme,
  accentRgb,
}: {
  position: "top" | "bottom";
  theme: "sunlit" | "dusk";
  /**
   * Optional override for the gold RGB triplet. Pass a pillar/stage
   * accent like "169,121,61" (gold-deep) or "88,101,88" (moss). When
   * omitted, defaults to harbor brand gold — gold-deep on sunlit,
   * gold-bright on dusk.
   */
  accentRgb?: string;
}) {
  // Default brand gold — matches the original /journal HairlineLens
  // exactly so the visual language is unchanged wherever the lens
  // appears without an accent override.
  const rgb =
    accentRgb ?? (theme === "sunlit" ? "169,121,61" : "196,147,78");

  // Alpha ladder — same five stops as the SVG version so the perceived
  // taper is identical. Inner stops at 0.95, mid at 0.50, outer at 0.
  // The middle stop carries the "weight" of the lens.
  const inner = 0.95;
  const mid = 0.5;
  const accentGradient = `linear-gradient(to right, rgba(${rgb},0) 0%, rgba(${rgb},${mid * 0.6}) 22%, rgba(${rgb},${inner}) 50%, rgba(${rgb},${mid * 0.6}) 78%, rgba(${rgb},0) 100%)`;

  // Theme-dependent shadow model.
  //   sunlit → 1px downward dark drop-shadow = ink impression on cream
  //   dusk   → outward gold halo + softer outer = focused beam in dark
  const boxShadow =
    theme === "sunlit"
      ? "0 0.5px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.35), 0 0 8px rgba(196,147,78,0.18)";

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-[6%] right-[6%] block h-px ${
        position === "top" ? "top-0" : "bottom-0"
      }`}
      style={{
        background: accentGradient,
        boxShadow,
      }}
    />
  );
}
