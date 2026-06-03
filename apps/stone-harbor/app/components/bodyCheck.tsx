"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — BodyCheck.
 *
 * A soft, optional somatic check-in offered above the journal textarea.
 * The man taps a small invitation line; this overlay appears; he taps
 * zero, one, or several body spots where he notices something; he
 * continues to the journal. The whole interaction is under 30 seconds.
 *
 * Design rationale:
 *   Trauma research consistently shows that members who name where
 *   a feeling lives in the body before they try to make narrative
 *   sense of it integrate the experience more effectively. The
 *   problem is that "body scan" exercises in clinical settings often
 *   take 10-20 minutes and require the member to lie still — which
 *   is incompatible with a man opening a journaling app for five
 *   minutes between meetings.
 *
 *   This component is the minimal viable somatic check: five
 *   recognizable spots, a single tap each, no breathing required, no
 *   instruction text, no rating scale. The data captured is sparse
 *   (an array of spot names) but the act of pausing to ask "where
 *   is this in my body?" is itself the intervention.
 *
 * Visual language:
 *   A simple human silhouette, drawn at low opacity in brand gold.
 *   Five soft circular spots overlay the figure at head, throat,
 *   chest, gut, hands. Tapping a spot fills it; tapping again
 *   unfills it. The figure breathes subtly — a 4s in/out scale
 *   animation echoing the breath circle elsewhere in the app, but
 *   gentler so the member can read his body, not synchronize with
 *   ours.
 *
 * Why not more spots:
 *   Five is enough to surface meaningful patterns (chest dominance
 *   for grief, gut dominance for anxiety, jaw/throat dominance for
 *   suppressed expression) without overwhelming a man who may never
 *   have been asked to attend to his body before. More spots become
 *   a vocabulary test instead of a check-in.
 *
 * Composition:
 *   Used inside the journal page. Render it conditionally via
 *   `isFeatureUnlocked(profile.created_at, FEATURE_THRESHOLDS.bodyCheck)`.
 *   The parent passes `open`/`onClose`/`onContinue`. The component
 *   doesn't persist data — the parent decides whether/when/how to
 *   write to the body_checks table.
 */

export type BodySpot = "head" | "throat" | "chest" | "gut" | "hands";

const SPOTS: { id: BodySpot; cx: number; cy: number; label: string }[] = [
  { id: "head", cx: 100, cy: 40, label: "Head" },
  { id: "throat", cx: 100, cy: 75, label: "Throat" },
  { id: "chest", cx: 100, cy: 115, label: "Chest" },
  { id: "gut", cx: 100, cy: 165, label: "Gut" },
  { id: "hands", cx: 55, cy: 175, label: "Hands" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onContinue: (spots: BodySpot[]) => void;
};

export function BodyCheck({ open, onClose, onContinue }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [selected, setSelected] = useState<Set<BodySpot>>(new Set());

  function toggleSpot(id: BodySpot) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleContinue() {
    onContinue(Array.from(selected));
    // Reset for next time.
    setSelected(new Set());
  }

  function handleSkip() {
    setSelected(new Set());
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{
            // A soft backdrop. Dusk uses near-black; Sunlit a cream wash
            // so the body silhouette reads against a warm field.
            backgroundColor: isDusk
              ? "rgba(10, 10, 11, 0.82)"
              : "rgba(243, 239, 231, 0.92)",
            backdropFilter: "blur(8px)",
          }}
          onClick={handleSkip}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`relative w-full max-w-md border p-8 ${
              isDusk
                ? "border-white/10 bg-black/40 backdrop-blur-md"
                : "border-[var(--sh-border-subtle)] bg-[#fbf8f1]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* PROMPT */}
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
              A breath in your body
            </p>
            <h2
              className={`${serif.className} mt-3 text-center text-2xl italic leading-snug text-[var(--sh-text-primary)]`}
            >
              Where do you notice something right now?
            </h2>
            <p className="mt-3 text-center text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              Tap nothing. Tap one. Tap several. There is no wrong answer.
            </p>

            {/* SILHOUETTE */}
            <div className="my-7 flex justify-center">
              <motion.svg
                viewBox="0 0 200 240"
                width="170"
                height="200"
                aria-hidden="true"
                animate={{ scale: [1, 1.012, 1] }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {/* Head */}
                <circle
                  cx="100"
                  cy="40"
                  r="18"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.25"
                  strokeWidth="1.2"
                />
                {/* Neck */}
                <path
                  d="M 92 56 L 92 64 M 108 56 L 108 64"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />
                {/* Torso */}
                <path
                  d="M 65 70 Q 100 60, 135 70 L 130 185 Q 100 195, 70 185 Z"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.22"
                  strokeWidth="1.2"
                />
                {/* Arms */}
                <path
                  d="M 65 70 Q 40 100, 50 170"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />
                <path
                  d="M 135 70 Q 160 100, 150 170"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />
                {/* Hands hint */}
                <circle
                  cx="50"
                  cy="173"
                  r="6"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />
                <circle
                  cx="150"
                  cy="173"
                  r="6"
                  fill="none"
                  stroke="var(--sh-accent-gold)"
                  strokeOpacity="0.2"
                  strokeWidth="1.2"
                />

                {/* Tappable spots */}
                {SPOTS.map((spot) => {
                  const active = selected.has(spot.id);
                  return (
                    <g key={spot.id}>
                      {/* For "hands" we also light the right hand. */}
                      {spot.id === "hands" && active && (
                        <circle
                          cx="150"
                          cy="173"
                          r="11"
                          fill="var(--sh-accent-gold)"
                          fillOpacity="0.85"
                        />
                      )}
                      <motion.circle
                        cx={spot.cx}
                        cy={spot.cy}
                        r={active ? 11 : 9}
                        fill={active ? "var(--sh-accent-gold)" : "transparent"}
                        fillOpacity={active ? 0.85 : 0}
                        stroke="var(--sh-accent-gold)"
                        strokeOpacity={active ? 0 : 0.55}
                        strokeWidth="1.5"
                        animate={{
                          scale: active ? [1, 1.12, 1] : 1,
                        }}
                        transition={{
                          duration: active ? 0.35 : 0,
                          ease: "easeOut",
                        }}
                        onClick={() => toggleSpot(spot.id)}
                        style={{ cursor: "pointer" }}
                      />
                      {/* Larger invisible hit target — fingers vs. pixels. */}
                      <circle
                        cx={spot.cx}
                        cy={spot.cy}
                        r="22"
                        fill="transparent"
                        onClick={() => toggleSpot(spot.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </g>
                  );
                })}
              </motion.svg>
            </div>

            {/* Labels for selected spots */}
            {selected.size > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-5 text-center text-xs italic leading-relaxed text-[var(--sh-text-secondary)]"
              >
                You named:{" "}
                {SPOTS.filter((s) => selected.has(s.id))
                  .map((s) => s.label.toLowerCase())
                  .join(", ")}
                .
              </motion.p>
            )}

            {/* Actions — both buttons treated equally */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
              >
                Not today
              </button>
              <button
                type="button"
                onClick={handleContinue}
                className="rounded-none bg-[var(--sh-accent-gold)] px-7 py-3 text-xs font-bold uppercase tracking-[0.28em] text-white shadow-md transition hover:bg-[#8d6432]"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
