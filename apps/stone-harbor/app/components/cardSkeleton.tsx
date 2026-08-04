"use client";

/**
 * Stone Harbor — card loading skeleton (SH-123).
 *
 * The dashboard's step panel and today's invitation both arrive after
 * their own round trips to Supabase. Until they land the page composes
 * without them, so the cards below jump upward the moment the data
 * resolves. The member's eye is already reading when the layout moves
 * under it.
 *
 * This holds the space. Same footprint as the loaded card, same width
 * tier, muted fill, a slow shimmer (see `.sh-skeleton` in globals.css)
 * so the placeholder reads as "coming" rather than "empty".
 *
 * Not a spinner, deliberately. A spinner asks the member to wait and
 * makes the waiting the subject. A skeleton says the shape of what is
 * arriving and keeps the page still.
 *
 * `lines` matches the placeholder to the card it stands in for — the
 * step panel is taller than the invitation, and a skeleton that is the
 * wrong height just relocates the layout shift rather than removing it.
 *
 * aria-hidden with an aria-busy region around it is deliberate: a
 * screen reader should hear "loading", not a description of grey
 * rectangles. The consuming card owns that announcement.
 */
export function CardSkeleton({
  lines = 3,
  className = "",
}: {
  /** Body rows under the eyebrow + title. Tune to the real card. */
  lines?: number;
  /** Width-tier / margin classes from the caller, matching the card. */
  className?: string;
}) {
  return (
    <div
      className={className}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="sh-skeleton px-6 py-7 lg:px-8 lg:py-8" aria-hidden="true">
        {/* Eyebrow — short, the width of "YOU'RE ON". */}
        <div className="h-2 w-24 rounded-sm bg-[var(--sh-text-muted)] opacity-25" />
        {/* Title — serif line, taller than the body rows. */}
        <div className="mt-4 h-6 w-3/5 rounded-sm bg-[var(--sh-text-muted)] opacity-20" />
        <div className="mt-5 flex flex-col gap-2.5">
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              // Last row runs short, the way a real paragraph's last
              // line does. Without it the block reads as a grey box
              // rather than as text about to appear.
              className={`h-3 rounded-sm bg-[var(--sh-text-muted)] opacity-15 ${
                i === lines - 1 ? "w-2/5" : "w-full"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
