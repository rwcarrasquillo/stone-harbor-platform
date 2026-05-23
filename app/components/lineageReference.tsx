"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { serif } from "@/lib/fonts";
import type { LineageTheme } from "@/lib/lineageMatcher";

/**
 * Stone Harbor — LineageReference.
 *
 * The "you wrote about this once" card that appears after a journal
 * entry is saved if the entry text touched a theme the member had
 * written about in his Lineage room.
 *
 * Visual approach:
 *   A quiet inline card with a soft gold left bar. Eyebrow names the
 *   theme ("WHAT YOUR FATHER DID WITH GRIEF") so the man knows what
 *   the harbor is reflecting back. Below the eyebrow, his own words
 *   in italic serif — verbatim, no paraphrasing. A small × in the
 *   corner lets him dismiss; the card also auto-clears when he
 *   starts writing the next entry.
 *
 * Why not a modal or toast:
 *   A modal would block him in a moment that should feel like a
 *   whisper, not an interruption. A toast would disappear too fast;
 *   the man should be able to sit with the line.
 *
 * Multi-reference handling:
 *   If a single entry triggers two themes (e.g., he wrote about
 *   "my father's anger" and "I never want to do that to my son"),
 *   we render all matched references stacked, each in its own card.
 *   The first month of usage will tell us if this overwhelms; for
 *   now showing all matches honors the man's writing.
 */

type Reference = {
  theme: LineageTheme;
  text: string;
  label: string;
};

type Props = {
  references: Reference[];
  onDismiss: () => void;
};

export function LineageReference({ references, onDismiss }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [dismissed, setDismissed] = useState<Set<LineageTheme>>(new Set());

  // Filter out anything the man has dismissed in-session.
  const visible = references.filter((r) => !dismissed.has(r.theme));
  if (visible.length === 0) return null;

  const dismissOne = (themeToDismiss: LineageTheme) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(themeToDismiss);
      // If this was the last visible reference, let the parent know
      // so it can clear its references state and prevent the card
      // returning on next render.
      if (next.size === references.length) {
        onDismiss();
      }
      return next;
    });
  };

  return (
    <AnimatePresence>
      <div className="space-y-3">
        {visible.map((ref) => (
          <motion.div
            key={ref.theme}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`relative border-l-[3px] p-5 ${
              isDusk
                ? "border-l-[var(--sh-accent-gold)] bg-black/30 backdrop-blur-sm"
                : "border-l-[var(--sh-accent-gold)] bg-[#fbf6ec]"
            }`}
            role="note"
            aria-label="A reference to something you wrote in your Lineage"
          >
            <button
              type="button"
              onClick={() => dismissOne(ref.theme)}
              aria-label="Dismiss this reference"
              className="absolute right-3 top-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
            >
              ×
            </button>
            <p className="pr-6 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
              You wrote about {ref.label}
            </p>
            <p
              className={`${serif.className} mt-2 text-base italic leading-snug text-[var(--sh-text-primary)] md:text-lg`}
            >
              &ldquo;{ref.text}&rdquo;
            </p>
            <p className="mt-3 text-[11px] italic text-[var(--sh-text-muted)]">
              Notice what you said then. Notice where you are now.
            </p>
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  );
}
