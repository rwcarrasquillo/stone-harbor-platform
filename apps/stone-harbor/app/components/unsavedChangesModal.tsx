"use client";

import { useEffect, useRef } from "react";
import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — UnsavedChangesModal.
 *
 * Renders when in-app navigation is attempted while a composer surface
 * has unsaved content. Pairs with the useUnsavedChangesWarning hook.
 *
 * Voice notes:
 *   - "Stay" is the recovery action. Default focus + primary visual
 *     weight goes here.
 *   - "Discard and leave" is the destructive action. Subordinate visual
 *     weight; the wording owns the consequence ("Discard" is clearer
 *     than "Leave").
 *   - Body copy is patient, not panicked: "What you wrote isn't saved
 *     yet" rather than "WAIT! You'll lose everything!"
 *
 * Theming uses CSS variables already in globals.css, so it works
 * identically in Sunlit and Dusk themes without needing branch logic.
 */

export function UnsavedChangesModal({
  open,
  onStay,
  onLeave,
  bodyLabel = "what you wrote",
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
  /**
   * Optional surface-specific noun for the body copy. Defaults to
   * "what you wrote". Pass "your reflection", "your journal entry",
   * etc. for surface-appropriate wording.
   */
  bodyLabel?: string;
}) {
  const stayButtonRef = useRef<HTMLButtonElement | null>(null);

  // Focus the safe (Stay) button when the modal opens, so an
  // accidental Enter press keeps the user on the page rather than
  // discarding their work.
  useEffect(() => {
    if (open) {
      // Defer focus to next tick so the element is mounted.
      const id = requestAnimationFrame(() => stayButtonRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  // Escape key triggers Stay (the safer option).
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onStay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onStay]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
      aria-describedby="unsaved-changes-body"
      data-testid="unsaved-changes-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
      onClick={(e) => {
        // Click on backdrop = same as Stay.
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div
        className="w-full max-w-md rounded-none border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card)] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
          Unsaved
        </p>
        <h2
          id="unsaved-changes-title"
          className={`${serif.className} mb-3 text-2xl italic leading-snug text-[var(--sh-text-primary)] md:text-3xl`}
        >
          Leave without saving?
        </h2>
        <p
          id="unsaved-changes-body"
          className="mb-6 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base"
        >
          {`You haven’t saved ${bodyLabel} yet. If you leave now, it’ll be lost. The harbor will hold it if you stay another moment.`}
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-testid="unsaved-changes-leave"
            onClick={onLeave}
            className="rounded-none border border-[var(--sh-border-subtle)] bg-transparent px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)] transition hover:border-[var(--sh-text-tertiary)] hover:text-[var(--sh-text-primary)] md:text-sm"
          >
            Discard and leave
          </button>
          <button
            type="button"
            ref={stayButtonRef}
            data-testid="unsaved-changes-stay"
            onClick={onStay}
            className="rounded-none border border-[var(--sh-accent-gold)] bg-[var(--sh-accent-gold)] px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] md:text-sm"
          >
            Stay on page
          </button>
        </div>
      </div>
    </div>
  );
}
