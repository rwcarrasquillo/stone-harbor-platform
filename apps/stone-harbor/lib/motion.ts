/**
 * Stone Harbor — motion timing system.
 *
 * One small system to keep animation feeling deliberate and
 * cohesive across the product. Without this, fade durations and
 * easings drift into "whatever felt right that day" — which reads
 * as inconsistency, not intention.
 *
 * Three durations, one default easing. That's it.
 *
 *   DURATION.quick   — 150ms — hover states, micro-interactions,
 *                      anything that should feel immediate
 *   DURATION.calm    — 400ms — fades, page transitions, modal
 *                      reveals, the default for "something is
 *                      happening"
 *   DURATION.patient — 1200ms — cross-fades between long-running
 *                      elements (image rotations, the breath
 *                      cycle's half-period, anything that should
 *                      feel meditative)
 *
 *   EASE.patient     — "easeInOut" — the default for everything
 *   EASE.settle      — [0.22, 1, 0.36, 1] — for moments that
 *                      should land softly (page enters, modal
 *                      reveals). Approx Material's "decelerate."
 *
 * Usage:
 *   import { DURATION, EASE } from "@/lib/motion";
 *   <motion.div transition={{ duration: DURATION.calm, ease: EASE.patient }} />
 *
 * Why not Tailwind variables:
 *   These are framer-motion / JS values, not CSS classes. Keeping
 *   them in TS gives us type safety and intellisense when
 *   referenced from .tsx files. CSS animations should reach for
 *   the same numeric values via Tailwind's `duration-*` utilities
 *   where possible (duration-150, duration-300/400, duration-1000+).
 */

export const DURATION = {
  /** 150ms — hover states, immediate micro-feedback. */
  quick: 0.15,
  /** 400ms — fades, page transitions, modal reveals. Default. */
  calm: 0.4,
  /** 1200ms — cross-fades on long-running elements, meditative motion. */
  patient: 1.2,
  /** 4000ms — half of the box-breath cycle (inhale OR exhale duration). */
  breath: 4,
} as const;

export const EASE = {
  /** The default — symmetric ease in and out. Quiet and predictable. */
  patient: "easeInOut" as const,
  /** Asymmetric ease-out — for entrances that should land softly. */
  settle: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

/**
 * Pre-baked transition objects for the most common motion patterns
 * in Stone Harbor. Use these instead of inlining { duration, ease }
 * objects so the choreography stays consistent.
 */
export const TRANSITION = {
  quick: { duration: DURATION.quick, ease: EASE.patient },
  calm: { duration: DURATION.calm, ease: EASE.patient },
  patient: { duration: DURATION.patient, ease: EASE.patient },
  settle: { duration: DURATION.calm, ease: EASE.settle },
  breath: { duration: DURATION.breath, ease: EASE.patient },
} as const;
