"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";

/**
 * Stone Harbor — SubMoods.
 *
 * A second-tier emotional refinement that appears beneath the primary
 * mood chips in the journal. After the man selects "Angry," he sees
 * four-or-five smaller, more specific feelings within that family:
 * resentful, hurt, frustrated, quietly furious, something else.
 *
 * Design rationale:
 *   Brené Brown's research in Atlas of the Heart catalogues 87 named
 *   emotions. Most men can name three: fine, mad, tired. Expanding
 *   the vocabulary even slightly — from 6 to ~36 — gives the man
 *   precision he didn't know he was missing. Naming an emotion
 *   accurately is itself a regulatory act.
 *
 * Why these specific sub-moods:
 *   For each primary mood, we chose four flavors that are commonly
 *   confused with the parent label and offer meaningfully different
 *   information for the journal. "Resentful" and "frustrated" both
 *   parse as anger in casual speech but lead to very different
 *   reflections. The fifth chip ("something else") gives permission
 *   to skip — no man is forced to pick from this list.
 *
 * Why this is optional:
 *   The sub-mood is metadata, not gating. The man can pick a parent
 *   mood, write his entry, and never engage with these chips. The
 *   journal still saves. The mood map still works. This is a deeper
 *   drawer for the man who wants it.
 *
 * Progressive disclosure:
 *   The parent gates this component with isFeatureUnlocked at
 *   FEATURE_THRESHOLDS.subMoods (day 60). Before that, the existing
 *   6-mood picker is the whole story.
 */

import type { Mood } from "@/lib/moods";

// Each entry is a short, lowercase-ready phrase the journal saves as
// metadata. The trailing "something else" is universal — it gives the
// man permission to bypass the suggestion without an empty-state.
const SUBMOODS_BY_MOOD: Record<Mood, string[]> = {
  grounded: ["present", "steady", "settled", "quiet", "something else"],
  confused: ["lost", "stuck", "ambivalent", "foggy", "something else"],
  angry: [
    "resentful",
    "hurt",
    "frustrated",
    "quietly furious",
    "something else",
  ],
  sad: ["grief", "lonely", "heavy", "defeated", "something else"],
  hopeful: [
    "tentative",
    "returning",
    "a glimpse",
    "possibility",
    "something else",
  ],
  strong: ["ready", "capable", "embodied", "integrated", "something else"],
};

type Props = {
  /** The parent mood the man already selected. */
  mood: Mood;
  /** Currently selected sub-mood, if any. */
  value: string | null;
  /** Called when the man picks (or unpicks) a sub-mood. */
  onChange: (value: string | null) => void;
};

export function SubMoods({ mood, value, onChange }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const options = SUBMOODS_BY_MOOD[mood];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        // Re-key on mood so picking a different parent mood re-runs
        // the entrance animation and the row "swaps" instead of just
        // re-labeling itself in place.
        key={mood}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mb-6 flex flex-wrap gap-2"
      >
        <p className="mb-1 w-full text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
          Closer to…
        </p>
        {options.map((option) => {
          const active = value === option;
          // Tapping the active chip again clears it — the man can
          // un-pick without selecting something else.
          const handleClick = () => onChange(active ? null : option);
          return (
            <button
              key={option}
              type="button"
              onClick={handleClick}
              className={`rounded-none border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
                active
                  ? "border-[var(--sh-accent-gold)] text-[var(--sh-accent-gold)]"
                  : isDusk
                    ? "border-white/15 bg-white/[0.03] text-white/55 hover:text-white/80"
                    : "border-[var(--sh-border-medium)] bg-[#f8f4ed] text-[var(--sh-text-tertiary)] hover:text-[var(--sh-text-secondary)]"
              }`}
              aria-pressed={active}
            >
              {option}
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
