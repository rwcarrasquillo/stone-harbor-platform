"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AnchorMark } from "@/app/components/anchorMark";
import { serif, sans } from "@/lib/fonts";
import type { StoryPrompt } from "@/lib/story";

/**
 * Stone Harbor — Compose Focus Mode.
 *
 * Full-viewport in-page writing surface for `/journal/compose`.
 * Not a modal — no backdrop, no window metaphor. The harbor "dims to
 * make room for the writing": same page, same state, minimal chrome.
 *
 * Voice preservation:
 *   • AnchorMark + serif italic wordmark stay in the top strip (harbor
 *     is still present, still witnessing)
 *   • serif italic on title + body (writing IS the room, not a form field)
 *   • Save uses text-link pattern (no gold button, no software chrome)
 *   • theme-aware Sunlit + Dusk
 *
 * ESC or Exit-focus button returns to the full composition with state
 * intact. Save from focus mode works identically to save from normal mode.
 */
type ComposeFocusModeProps = {
  title: string;
  content: string;
  onTitleChange: (v: string) => void;
  onContentChange: (v: string) => void;
  storyPrompt: StoryPrompt | null;
  saving: boolean;
  onSave: () => void;
  onExit: () => void;
  isDusk: boolean;
  wordCount: number;
};

export function ComposeFocusMode({
  title,
  content,
  onTitleChange,
  onContentChange,
  storyPrompt,
  saving,
  onSave,
  onExit,
  isDusk,
  wordCount,
}: ComposeFocusModeProps) {
  const t = useTranslations("journal");

  // ESC to exit — cleaned up on unmount so the handler doesn't leak
  // if the parent unmounts while we're active.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <div
      className={`${sans.className} fixed inset-0 z-40 flex flex-col bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
      role="region"
      aria-label={t("focusModeAria")}
    >
      {/* Aria-live announcement on mount */}
      <span className="sr-only" aria-live="polite">
        {t("focusModeActive")}
      </span>

      {/* Top strip — AnchorMark + wordmark on left, save + exit on right */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-6 py-4 md:px-10 md:py-5">
        <Link
          href="/journal"
          className="flex items-center gap-3"
          aria-label="Back to Journal"
        >
          <AnchorMark size={28} />
          <span
            className={`${serif.className} text-[18px] italic tracking-[-0.012em] text-[var(--sh-text-primary)] md:text-[20px]`}
          >
            Stone Harbor
          </span>
          <span className="text-[14px] text-[var(--sh-text-muted)] md:text-[16px]">
            ·
          </span>
          <span
            className={`${serif.className} text-[18px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)] md:text-[20px]`}
          >
            {t("focusModeTitle")}
          </span>
        </Link>
        <div className="flex items-center gap-5 md:gap-6">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || content.trim().length === 0}
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
          >
            {saving ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)]`}
          >
            {t("exitFocus")}
          </button>
        </div>
      </header>

      {/* Writing pane — fills remaining viewport, bounded via flex */}
      <section className="flex min-h-0 flex-1 flex-col px-6 pt-6 md:px-24 md:pt-8">
        {storyPrompt && (
          <div className="mb-6 border-l-2 border-[var(--sh-accent-gold)] pl-4">
            <p
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
            >
              {t("storyHeader")}
            </p>
            <p
              className={`${serif.className} mt-2 text-[16px] italic leading-[1.5] text-[var(--sh-text-secondary)]`}
            >
              {storyPrompt.prompt_text}
            </p>
          </div>
        )}

        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t("titlePlaceholder")}
          style={
            !isDusk
              ? {
                  textShadow:
                    "0 1px 0 rgba(255,248,235,0.55), 0 -0.5px 0 rgba(60,40,15,0.08)",
                  outline: "none",
                  outlineOffset: 0,
                }
              : { outline: "none", outlineOffset: 0 }
          }
          className={`${serif.className} flex-shrink-0 bg-transparent text-[32px] font-medium leading-[1.1] tracking-[-0.015em] text-[var(--sh-text-primary)] placeholder:font-normal placeholder:italic placeholder:text-[var(--sh-text-muted)] md:text-[44px]`}
        />

        <textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={t("reflectionPlaceholder")}
          style={{ outline: "none", outlineOffset: 0 }}
          className={`${serif.className} mt-5 flex-1 resize-none bg-transparent text-[16px] italic leading-[1.65] text-[var(--sh-text-secondary)] placeholder:text-[var(--sh-text-muted)] md:mt-7 md:text-[18px]`}
        />
      </section>

      {/* Bottom strip — word count. Mobile only; desktop hides via md:hidden. */}
      <footer
        className="flex flex-shrink-0 items-center justify-between border-t border-[var(--sh-border-subtle)] px-6 py-3 md:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
          {wordCount === 0
            ? t("wordsZero")
            : wordCount === 1
              ? t("wordsOne")
              : t("wordsMany", { count: wordCount })}
        </span>
        <span className="text-[10px] italic text-[var(--sh-text-muted)]">
          {t("focusEscHint")}
        </span>
      </footer>
    </div>
  );
}
