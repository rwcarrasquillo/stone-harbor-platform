"use client";

/**
 * Stone Harbor — AmnioticBackdrop.
 *
 * Atmospheric warm-dusk layer behind every authenticated page on
 * Dusk theme. Three large radial gradients (gold blob upper-right,
 * deeper amber blob lower-left, gentle center wash) over a true-
 * black base. Optional moss undertone.
 *
 * **Fully static as of 2026-06-01.** Previous versions animated all
 * four gradient layers with framer-motion and rendered an SVG
 * feTurbulence noise overlay. Even with `will-change`, lowered blur
 * radii, and `useReducedMotion()` gating, the combination produced
 * subtle frame-to-frame flicker on the Dusk dashboard — especially
 * when stacked with the door card's own contained backdrop (which
 * was removed in the same fix). The user's explicit request: "same
 * colors with no effect at all." So motion + filter passes are
 * gone; what remains is pure CSS gradients on plain divs. Zero
 * paint cost, zero composite passes, zero perceived flicker.
 *
 * Layers, in z-order (back to front):
 *
 *   1. Base dark — true black so the gradients show their warmth
 *   2. Upper-right gold blob (static, soft blur)
 *   3. Lower-left deeper amber blob (static, soft blur)
 *   4. Center pulse — kept as a low-opacity wash for soft midground
 *   5. Faint moss undertone (optional via `moss` prop)
 *
 * Usage:
 *
 *   <AmnioticBackdrop />              // full-screen fixed (page-level)
 *   <AmnioticBackdrop contained />    // absolute inside a relative parent (card-level)
 *
 * Tunables:
 *   intensity prop scales the overall opacity. 1 = default, 0.5 =
 *   subtle (card-level), 1.4 = stronger.
 */

type Props = {
  /** When true, uses absolute positioning + overflow-hidden (for inside a card). */
  contained?: boolean;
  /** Opacity multiplier across all layers. Default 1. */
  intensity?: number;
  /** Tailwind classes for the outer wrapper. */
  className?: string;
  /**
   * Whether to include the lowest-frequency moss undertone. Set false
   * for cards where you want pure gold/amber warmth.
   */
  moss?: boolean;
};

export function AmnioticBackdrop({
  contained = false,
  intensity = 1,
  className = "",
  moss = true,
}: Props) {
  const positionClass = contained
    ? "absolute inset-0 overflow-hidden"
    : "fixed inset-0";

  // Multiply all per-layer opacities by the intensity prop. Same
  // formula as the previous animated version, so a Dusk surface
  // tuned at intensity=0.7 looks identical to before — just with
  // no drift.
  const op = (n: number) => Math.max(0, Math.min(1, n * intensity));

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none z-0 ${positionClass} ${className}`}
    >
      {/* Base dark — anchors the warmth */}
      <div className="absolute inset-0 bg-[#0A0A0B]" />

      {/* Upper-right gold blob — the dominant warmth.
          Positioned past the viewport edge so the falloff feels
          natural at the screen corner. Blur kept generous so the
          gradient feels like atmosphere, not a hard shape. */}
      <div
        className="absolute -top-1/4 -right-1/4 h-[110%] w-[90%]"
        style={{
          background: `radial-gradient(circle, rgba(196,147,78,${op(0.32)}) 0%, rgba(196,147,78,${op(0.10)}) 35%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />

      {/* Lower-left deeper amber blob — counterweight to the
          upper-right gold. Slightly larger so the screen feels
          held from below. */}
      <div
        className="absolute -bottom-1/4 -left-1/4 h-[110%] w-[100%]"
        style={{
          background: `radial-gradient(circle, rgba(169,121,61,${op(0.22)}) 0%, rgba(169,121,61,${op(0.06)}) 40%, transparent 75%)`,
          filter: "blur(50px)",
        }}
      />

      {/* Center wash — a gentle midground glow so the middle of
          the viewport isn't pure black. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(196,147,78,${op(0.10)}) 0%, transparent 60%)`,
          filter: "blur(45px)",
        }}
      />

      {/* Subtle moss undertone — only if requested. Adds a hint
          of cool green into the lower-left so the warmth isn't
          one-note. */}
      {moss && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 30% 70%, rgba(88,101,88,${op(0.10)}) 0%, transparent 65%)`,
            filter: "blur(50px)",
          }}
        />
      )}
    </div>
  );
}
