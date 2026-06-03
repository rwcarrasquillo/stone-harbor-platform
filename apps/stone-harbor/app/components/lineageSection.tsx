"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — LineageSection.
 *
 * The Lineage room in /welcome. Three optional textareas, framed
 * carefully, no required fields, no completion shaming. The
 * heaviest emotional invitation in the harbor — placed last on the
 * disclosure timeline (day 90) so significant trust has accumulated
 * before the man is asked these questions.
 *
 * Auto-collapse:
 *   After three visits with all three fields empty, the section
 *   default-collapses to a quiet "threshold" element: a thin gold
 *   horizontal line with a chevron circle and the words "OPEN THE
 *   ROOM" beneath. The man can tap the threshold to expand the
 *   section at any time. If he has any content in any field, the
 *   section is always expanded (no collapse toggle even appears).
 *
 *   This honors the original design philosophy: optional inputs
 *   should stop looking like unfilled todos. The lineage room is
 *   still there — just no longer the first thing the man sees when
 *   he edits his profile.
 *
 * Theme awareness:
 *   Dark-glass on Dusk, cream on Sunlit, matching the other
 *   profile editor sections.
 */

type Props = {
  fatherGrief: string;
  fatherAnger: string;
  patternToLeave: string;
  onChangeFatherGrief: (value: string) => void;
  onChangeFatherAnger: (value: string) => void;
  onChangePatternToLeave: (value: string) => void;
  /**
   * Initial collapsed state — supplied by /welcome based on the
   * profile's lineage_section_visit_count. If true, the section
   * renders as a threshold; the man taps to expand. Defaults to
   * false so direct deep-links (/welcome#lineage) always open
   * expanded regardless of visit count.
   */
  defaultCollapsed?: boolean;
};

export function LineageSection({
  fatherGrief,
  fatherAnger,
  patternToLeave,
  onChangeFatherGrief,
  onChangeFatherAnger,
  onChangePatternToLeave,
  defaultCollapsed = false,
}: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // If the man has typed ANYTHING in ANY field, the section is
  // forced open. We never hide work he's already done — only the
  // empty-state threshold can be collapsed.
  const hasContent = !!(
    fatherGrief.trim() ||
    fatherAnger.trim() ||
    patternToLeave.trim()
  );
  const isOpen = hasContent || !collapsed;

  return (
    <section
      className={`mt-12 border-t pt-10 ${
        isDusk ? "border-white/10" : "border-[var(--sh-border-subtle)]"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[var(--sh-accent-gold)]">
        Lineage
      </p>
      <h3
        className={`${serif.className} mt-3 text-3xl font-medium leading-tight text-[var(--sh-text-primary)]`}
      >
        What you carry from before you.
      </h3>

      {/* Expand/collapse the body. Threshold visual when collapsed;
          full prompts + textareas when open. We use AnimatePresence
          so the transition is a soft height fade rather than a hard
          snap — important here because the section is emotionally
          weighted and a jarring open/close would undercut the tone. */}
      <AnimatePresence mode="wait" initial={false}>
        {isOpen ? (
          <motion.div
            key="open"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.45, ease: "easeInOut" }}
            // overflow-hidden so the height transition doesn't show
            // a half-clipped textarea during the animation
            className="overflow-hidden"
          >
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
              Three quiet prompts about what your father did, and what
              you choose to do differently. Nothing here is required.
              Nothing is displayed anywhere. This page is for you.
            </p>

            <div className="mt-8 grid gap-6">
              <LineageField
                label="Something my father did with grief"
                help="Whether you want to remember it, or not repeat it."
                value={fatherGrief}
                onChange={onChangeFatherGrief}
                isDusk={isDusk}
              />
              <LineageField
                label="Something my father did with anger"
                help="Whether you want to remember it, or not repeat it."
                value={fatherAnger}
                onChange={onChangeFatherAnger}
                isDusk={isDusk}
              />
              <LineageField
                label="One pattern I'd like to leave behind"
                help="The line you cross when you cross it."
                value={patternToLeave}
                onChange={onChangePatternToLeave}
                isDusk={isDusk}
              />
            </div>

            {/* Allow manual collapse only if there's nothing to lose.
                Hiding the "Close" button when content exists prevents
                the man from accidentally collapsing his own writing
                under the threshold. */}
            {!hasContent && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="group flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-accent-gold)]"
                  aria-label="Close the lineage room"
                >
                  <Chevron up />
                  <span>Close the room</span>
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.button
            key="threshold"
            type="button"
            onClick={() => setCollapsed(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="group mt-8 flex w-full flex-col items-center gap-3 py-2 transition"
            aria-label="Open the lineage room"
          >
            {/* The threshold — two soft gold lines with a chevron
                circle in the middle. Reads as the lintel of a door
                rather than a UI button. The whole row is the click
                target; the visual is the affordance. */}
            <div className="flex w-full max-w-xs items-center gap-3">
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-[var(--sh-accent-gold)]/40 transition group-hover:bg-[var(--sh-accent-gold)]/70"
              />
              <ChevronCircle isDusk={isDusk} />
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-[var(--sh-accent-gold)]/40 transition group-hover:bg-[var(--sh-accent-gold)]/70"
              />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)] transition group-hover:text-[var(--sh-accent-gold)]">
              Open the room
            </span>
            <span className="text-[11px] italic text-[var(--sh-text-muted)]">
              The lineage prompts are here when you&apos;re ready.
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Small chevron icon used in the inline "Close the room" affordance.
 * Up-chevron because closing folds the section upward; the down
 * variant lives inside ChevronCircle for the open-the-room threshold.
 */
function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: up ? "rotate(180deg)" : undefined }}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * The threshold chevron — a small gold-bordered circle with a
 * downward chevron inside. Sits between the two horizontal lines
 * to read as the visual center of the doorway. Sized at 24px so it
 * registers as a deliberate gesture without dominating the row.
 */
function ChevronCircle({ isDusk }: { isDusk: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition group-hover:border-[var(--sh-accent-gold)] group-hover:bg-[var(--sh-accent-gold)]/10 ${
        isDusk
          ? "border-[var(--sh-accent-gold)]/60"
          : "border-[var(--sh-accent-gold)]/55"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="var(--sh-accent-gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}

function LineageField({
  label,
  help,
  value,
  onChange,
  isDusk,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  isDusk: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {label}
      </label>
      <p className="mb-3 text-[11px] italic text-[var(--sh-text-muted)]">
        {help}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`w-full resize-y border px-5 py-4 text-sm leading-relaxed transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
          isDusk
            ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
            : "border-[var(--sh-border-medium)] bg-[#f8f4ed] text-[var(--sh-text-primary)]"
        }`}
        placeholder="Leave blank if not now."
      />
    </div>
  );
}
