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

/* =============================================================
 * Page-entrance cascade — the harbor's house style for reveals
 * =============================================================
 *
 * Every member-facing page reveals itself top-to-bottom in a
 * coordinated cascade: the header strip is structural and renders
 * static, then each major section below fades up softly, one beat
 * after the next. The pacing is deliberate enough that the page
 * reads as "unfolding" rather than "snapping into place," but not
 * so slow that an impatient member is waiting on the UI.
 *
 * Timing:
 *   - Each section fades for CASCADE_DURATION (0.7s — midway
 *     between DURATION.calm and DURATION.patient).
 *   - Sections start 300ms apart, so a 4-element page lands
 *     fully at ~2.2s, a 5-element page at ~2.5s.
 *   - The first section starts at delay 0.6s — leaves space for
 *     a top "anchor strip" or PersonalizedGreeting to occupy
 *     attention while the rest fades in.
 *   - EASE.settle (ease-out-expo) is used everywhere so the
 *     elements drift into place rather than punching in.
 *
 * Usage:
 *
 *   import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
 *
 *   <motion.div {...cascadeFadeUp} transition={cascadeTransition(0)}>
 *     first section
 *   </motion.div>
 *   <motion.div {...cascadeFadeUp} transition={cascadeTransition(1)}>
 *     second section
 *   </motion.div>
 *
 * `cascadeTransition(stepIndex)` returns the right transition for
 * the Nth element in the cascade (0-indexed). For pages with custom
 * timing needs, the underlying constants are also exported so the
 * page can compute a bespoke delay.
 *
 * Designed 2026-06-19 on /dashboard, lifted into shared vocabulary
 * the same day so /journal and every other member surface can wear
 * the same entrance. */

/** Per-element fade duration for the cascade. */
export const CASCADE_DURATION = 0.7;

/** Time the first cascade element waits before fading in. Leaves
 *  room for a top strip (greeting, daily prompt) to land first. */
export const CASCADE_BASE_DELAY = 0.6;

/** Gap between successive cascade elements. */
export const CASCADE_STEP = 0.3;

/** Initial/animate prop pair for the cascade fade-up. Soft 12px
 *  lift + opacity ramp. Pass this in as `{...cascadeFadeUp}`. */
export const cascadeFadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
} as const;

/**
 * Returns the right framer-motion `transition` for the Nth element
 * in a page's entrance cascade (0-indexed). Step 0 = first to fade
 * in, step 1 = second, etc.
 *
 * Example: a 4-section page calls cascadeTransition(0..3) on its
 * four motion.div wrappers, and the cascade lands roughly together
 * at delay 0.6 + 3·0.3 + 0.7 = 2.2s.
 */
export function cascadeTransition(stepIndex: number) {
  return {
    duration: CASCADE_DURATION,
    ease: EASE.settle,
    delay: CASCADE_BASE_DELAY + stepIndex * CASCADE_STEP,
  };
}
