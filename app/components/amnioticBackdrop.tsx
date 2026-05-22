"use client";

import { motion } from "framer-motion";

/**
 * Stone Harbor — AmnioticBackdrop.
 *
 * An abstract atmospheric layer designed to feel like floating in
 * warm fluid. Three large blurred radial gradients drift at
 * different speeds and scales, layered over organic noise. No
 * photographs — pure light + motion. Slower than the breath,
 * slower than thought.
 *
 * The aesthetic word is *amniotic*: warm, slow, embracing, never
 * jarring, never the focus. The dashboard becomes a contained
 * space the member is *inside*, rather than scrolling across.
 *
 * Layers, in z-order (back to front):
 *
 *   1. Base dark — true black so the gradients show their warmth
 *   2. Upper-right gold blob (60s drift, 50-90% size)
 *   3. Lower-left deep amber blob (75s drift, opposite direction)
 *   4. Center subtle pulse (40s pulse, low opacity)
 *   5. Faint moss undertone (90s drift, very low opacity)
 *   6. Organic noise grain (static, mix-blend-overlay)
 *
 * Performance:
 *   All layers are CSS `transform` and `opacity` animations — the
 *   GPU handles them and they cost almost nothing. No reflows, no
 *   layout thrash. Tested on iPhone SE with no frame drops.
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

  // Multiply all per-layer opacities by the intensity prop.
  const op = (n: number) => Math.max(0, Math.min(1, n * intensity));

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none z-0 ${positionClass} ${className}`}
    >
      {/* Base dark — anchors the warmth */}
      <div className="absolute inset-0 bg-[#0A0A0B]" />

      {/* Upper-right gold blob — the dominant warmth */}
      <motion.div
        animate={{
          x: ["-8%", "12%", "-8%"],
          y: ["-6%", "8%", "-6%"],
          scale: [1, 1.18, 1],
        }}
        transition={{
          duration: 58,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-1/4 -right-1/4 h-[110%] w-[90%]"
        style={{
          background: `radial-gradient(circle, rgba(196,147,78,${op(0.32)}) 0%, rgba(196,147,78,${op(0.10)}) 35%, transparent 70%)`,
          filter: "blur(60px)",
        }}
      />

      {/* Lower-left deeper amber blob — counterweight, slower */}
      <motion.div
        animate={{
          x: ["8%", "-12%", "8%"],
          y: ["6%", "-8%", "6%"],
          scale: [1, 1.22, 1],
        }}
        transition={{
          duration: 75,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -bottom-1/4 -left-1/4 h-[110%] w-[100%]"
        style={{
          background: `radial-gradient(circle, rgba(169,121,61,${op(0.22)}) 0%, rgba(169,121,61,${op(0.06)}) 40%, transparent 75%)`,
          filter: "blur(80px)",
        }}
      />

      {/* Center pulse — gentle breathing of the whole field */}
      <motion.div
        animate={{
          opacity: [op(0.4), op(0.6), op(0.4)],
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(196,147,78,${op(0.10)}) 0%, transparent 60%)`,
          filter: "blur(70px)",
        }}
      />

      {/* Subtle moss undertone — only if requested, very low opacity */}
      {moss && (
        <motion.div
          animate={{
            x: ["5%", "-5%", "5%"],
            y: ["-3%", "3%", "-3%"],
          }}
          transition={{
            duration: 90,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 30% 70%, rgba(88,101,88,${op(0.10)}) 0%, transparent 65%)`,
            filter: "blur(80px)",
          }}
        />
      )}

      {/* Organic noise grain — gives the gradients body */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="amniotic-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.7"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#amniotic-noise)" />
      </svg>
    </div>
  );
}
