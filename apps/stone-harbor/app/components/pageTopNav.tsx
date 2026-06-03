import Link from "next/link";

/**
 * Stone Harbor — PageTopNav.
 *
 * The canonical top-navigation band used on every authenticated
 * member page that follows the "← Dashboard / Stone Harbor" pattern.
 * Renders a self-contained band wrapped in `max-w-7xl` so the back-
 * link anchors to the same horizontal position regardless of whether
 * the page's content section below is `max-w-7xl`, `max-w-5xl`, or
 * narrower (e.g. `max-w-2xl` on the Map).
 *
 * Why this exists:
 *   Before this component, every page rendered its own copy of the
 *   nav JSX. Drift was inevitable — one page used `max-w-6xl`, another
 *   put the back-affordance at the bottom, another swapped the text
 *   link for an icon button. Members on a multi-page session felt the
 *   nav physically MOVE as they walked between pages. Centralizing
 *   the band in one place means the next divergence has to be a
 *   deliberate prop change, not an accidental copy-paste artifact.
 *
 * Intentional exceptions:
 *   /meditation and /vent are bespoke focus-experience pages that
 *   deliberately replace the canonical nav with a quieter affordance
 *   (icon-only back arrow + status text). They do NOT use this
 *   component — that omission is by design and documented in their
 *   page files.
 *
 * The `wordmark` slot accepts arbitrary text on the right edge, with
 * an optional `wordmarkHref` to make it a link. Pages that prefer a
 * status indicator over a link (e.g. "Locale" or "Private") can pass
 * a string and omit the href.
 *
 * Spacing:
 *   The band uses `mb-6 md:mb-8` so the page header that follows it
 *   has consistent breathing room from page to page. The outer
 *   container uses `pt-8` to match the established top spacing on
 *   /dashboard, /journal, /messages, /members-blog.
 */

type Props = {
  /** Where the ← link navigates. Defaults to "/dashboard". */
  backHref?: string;
  /** The gold label shown next to the arrow. Defaults to "Dashboard". */
  backLabel?: string;
  /** The tiny eyebrow shown under the back label. Defaults to "Return To Harbor". */
  backEyebrow?: string;
  /** Text on the right side. Defaults to "Stone Harbor". */
  wordmark?: string;
  /** Optional href for the wordmark. If omitted, renders plain text. Defaults to "/". */
  wordmarkHref?: string;
  /**
   * Extra classes applied to the inner `<div>` row. Use this for
   * page-specific tuning of bottom margin etc.
   */
  className?: string;
};

export function PageTopNav({
  backHref = "/dashboard",
  backLabel = "Dashboard",
  backEyebrow = "Return To Harbor",
  wordmark = "Stone Harbor",
  wordmarkHref = "/",
  className = "mb-6 md:mb-8",
}: Props) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-8 md:px-8">
      <div
        className={`flex items-center justify-between ${className}`}
      >
        <Link
          href={backHref}
          className="group flex flex-col leading-none no-underline"
        >
          <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
            ← {backLabel}
          </span>
          <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
            {backEyebrow}
          </span>
        </Link>
        {wordmarkHref ? (
          <Link
            href={wordmarkHref}
            className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[#a9793d]"
          >
            {wordmark}
          </Link>
        ) : (
          <span className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
            {wordmark}
          </span>
        )}
      </div>
    </div>
  );
}
