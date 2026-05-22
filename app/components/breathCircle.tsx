"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { serif } from "@/lib/fonts";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Stone Harbor — BreathCircle.
 *
 * The single, canonical breathing circle used across the product:
 * home page (`/`), dashboard meditation entry, and the full
 * `/meditation` sanctuary. One component, one cadence, one set of
 * colors — so the circle becomes a recognizable brand motif rather
 * than three uncoordinated implementations.
 *
 * The 4-second inhale / 4-second exhale rhythm is the U.S. Navy SEAL
 * box-breathing standard. It's also long enough to feel meditative
 * without being so slow it reads as broken.
 *
 * Size scale:
 *   sm  — 80px,  for inline use in cards / banners
 *   md  — 128px, the home page and dashboard sizes
 *   lg  — 176px, /meditation main circle
 *
 * Progress ring:
 *   Pass `progressFraction` (0 to 1) and an SVG gold arc renders
 *   around the outer edge. Used on the home page's 60-second
 *   commitment ring. Pass `undefined` to omit the ring entirely.
 *
 * Why a self-contained component:
 *   Earlier these existed as three separate JSX blocks with
 *   slightly different scale ranges (1.25, 1.4, 1.45), slightly
 *   different border opacities, and slightly different glow
 *   gradients. Now there's one truth.
 */

type Size = "sm" | "md" | "lg";
type Props = {
  /** Current phase of the box-breath cycle. */
  phase: "inhale" | "exhale";
  /** Visual size. Defaults to "md". */
  size?: Size;
  /**
   * Optional 0-to-1 fraction for a gold progress arc around the
   * outside of the circle. Use for the home page's 60-second ring.
   */
  progressFraction?: number;
  /**
   * Override the centered label. By default shows "Inhale" / "Exhale".
   * Pass null to hide the label entirely.
   */
  label?: React.ReactNode | null;
  /**
   * Override the inner shadow color (defaults to brand gold #c4934e).
   * Useful when the circle sits on a colored panel that needs a
   * different accent — e.g., moss for a calm card.
   */
  accent?: string;
  className?: string;
};

const SIZE_PX: Record<Size, number> = {
  sm: 80,
  md: 128,
  lg: 176,
};

const TEXT_CLASS: Record<Size, string> = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-2xl",
};

export function BreathCircle({
  phase,
  size = "md",
  progressFraction,
  label,
  accent = "#c4934e",
  className = "",
}: Props) {
  // We tween the inner circle from 1x → ~1.4x on inhale, back on
  // exhale. The full canvas (wrapper + optional progress ring) is
  // sized to comfortably hold the max-extent inhale state.
  const px = SIZE_PX[size];
  const canvasPx = Math.round(px * 1.4);

  // Default label is the phase name unless explicitly overridden.
  const labelNode =
    label === undefined ? (phase === "inhale" ? "Inhale" : "Exhale") : label;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: canvasPx, height: canvasPx }}
    >
      {/* Optional progress ring — gold arc around the outside. */}
      {progressFraction !== undefined && (
        <ProgressRing fraction={progressFraction} accent={accent} />
      )}

      {/* The breathing circle itself. */}
      <motion.div
        animate={{
          scale: phase === "inhale" ? 1.4 : 1,
          opacity: phase === "inhale" ? 0.95 : 0.6,
        }}
        transition={{ duration: DURATION.breath, ease: EASE.patient }}
        className="flex items-center justify-center rounded-full border"
        style={{
          width: px,
          height: px,
          borderColor: accent + "66",
          background: `radial-gradient(circle, ${accent}38 0%, ${accent}0a 70%, transparent 100%)`,
        }}
      >
        {labelNode !== null && (
          <span
            className={`${serif.className} italic ${TEXT_CLASS[size]}`}
            style={{ color: accent === "#c4934e" ? "rgba(255,255,255,0.92)" : accent }}
          >
            {labelNode}
          </span>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Hook that runs the 4s/4s box-breath cycle and returns the
 * current phase. Use this when you want a BreathCircle and don't
 * want to wire the interval yourself.
 *
 *   const phase = useBreathCycle();
 *   <BreathCircle phase={phase} />
 */
export function useBreathCycle() {
  const [phase, setPhase] = useState<"inhale" | "exhale">("inhale");
  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, DURATION.breath * 1000);
    return () => clearInterval(id);
  }, []);
  return phase;
}

/**
 * SVG progress arc rendered around the outside of the circle.
 * Uses pathLength=100 so the dashoffset math is simple percentage.
 */
function ProgressRing({
  fraction,
  accent,
}: {
  fraction: number;
  accent: string;
}) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const offset = 100 - clamped * 100;
  return (
    <svg
      className="absolute inset-0 h-full w-full -rotate-90"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke={accent}
        strokeOpacity="0.18"
        strokeWidth="0.6"
      />
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke={accent}
        strokeWidth="1.1"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s linear" }}
      />
    </svg>
  );
}
