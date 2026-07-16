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
 *   /roadmap and /members-blog rely on this to tint the lens per pillar
 *   — Calm's lens is moss, not gold. Omit the prop and the lens falls
 *   back to harbor brand gold for the active theme.
 *
 * Token plumbing (SH-100 Wave 1):
 *   The brand-gold default is no longer hard-coded here. It comes from
 *   --sh-hairline-rgb, which globals.css switches on data-theme
 *   (sunlit → 169,121,61 / dusk → 196,147,78). An `accentRgb` override
 *   is applied by re-declaring that same custom property on this
 *   element, so the gradient below never needs to know which case it's
 *   in — the cascade resolves it.
 *
 *   The Dusk halo deliberately reads --sh-hairline-rgb-*dusk* rather
 *   than the switching token: the halo stays brand gold even when the
 *   lens itself is tinted moss, which is the existing behavior.
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
   * Optional override for the lens RGB triplet. Pass a pillar/stage
   * accent like "169,121,61" (gold-deep) or "88,101,88" (moss). When
   * omitted, the lens inherits --sh-hairline-rgb, which resolves to
   * harbor brand gold for the active theme.
   */
  accentRgb?: string;
}) {
  // Alpha ladder — same five stops as the SVG version so the perceived
  // taper is identical. Inner stops at 0.95, mid at 0.50, outer at 0.
  // The middle stop carries the "weight" of the lens.
  const inner = 0.95;
  const mid = 0.5;
  const rgb = "var(--sh-hairline-rgb)";
  const accentGradient = `linear-gradient(to right, rgba(${rgb},0) 0%, rgba(${rgb},${mid * 0.6}) 22%, rgba(${rgb},${inner}) 50%, rgba(${rgb},${mid * 0.6}) 78%, rgba(${rgb},0) 100%)`;

  // Theme-dependent shadow model.
  //   sunlit → 1px downward dark drop-shadow = ink impression on cream
  //   dusk   → outward gold halo + softer outer = focused beam in dark
  const dusk = "var(--sh-hairline-rgb-dusk)";
  const boxShadow =
    theme === "sunlit"
      ? "0 0.5px 0 rgba(60,40,15,0.18)"
      : `0 0 4px rgba(${dusk},0.35), 0 0 8px rgba(${dusk},0.18)`;

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-[6%] right-[6%] block h-px ${
        position === "top" ? "top-0" : "bottom-0"
      }`}
      style={
        {
          // Re-declaring the custom property here is what makes the
          // override work: the gradient reads var(--sh-hairline-rgb)
          // either way, and this shadows the :root / [data-theme] value
          // for this element only. Omitted prop → undefined → inherits.
          "--sh-hairline-rgb": accentRgb,
          background: accentGradient,
          boxShadow,
        } as React.CSSProperties
      }
    />
  );
}
