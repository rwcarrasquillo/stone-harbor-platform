/**
 * DraftPlaceholder — the single most important convention in the
 * sister-skeleton build.
 *
 * Every heading, prompt, mood word, and chapter title in this skeleton
 * is placeholder scaffolding, NOT final voice. The Long Light's voice
 * belongs to the editorial cofounder, and she needs to be able to look
 * at any screen and instantly tell "this is shape, not words I have to
 * live with."
 *
 * This wrapper makes that unmistakable:
 *   - a honey left-border rail (the Hearth accent)
 *   - a small lowercase "[ draft ]" chip pinned top-right
 *   - muted italic text so placeholder copy never reads as committed
 *   - an optional `note` line for editorial context ("what goes here
 *     and why") that renders beneath the children in smaller type
 *
 * When real voice lands in Phase 4, the rule is simple: if it's still
 * wrapped in <DraftPlaceholder>, it hasn't been signed off.
 */

import type { ReactNode } from "react";

interface DraftPlaceholderProps {
  children: ReactNode;
  /** Editorial-context line: what this section is for, rendered muted. */
  note?: string;
  className?: string;
}

export function DraftPlaceholder({
  children,
  note,
  className = "",
}: DraftPlaceholderProps) {
  return (
    <div
      className={`relative rounded-sm border-l-2 border-[var(--accent-long-light)] bg-[var(--background-recessed)]/40 pl-4 pr-3 py-3 ${className}`}
    >
      <span className="pointer-events-none absolute right-2 top-2 select-none rounded-sm bg-[var(--accent-long-light)] px-1.5 py-0.5 text-[10px] lowercase tracking-wide text-[var(--text-primary)]/80">
        [ draft ]
      </span>
      <div className="pr-14 italic text-[var(--text-secondary)]">{children}</div>
      {note ? (
        <p className="mt-2 text-xs not-italic text-[var(--text-secondary)]/70">
          {note}
        </p>
      ) : null}
    </div>
  );
}
