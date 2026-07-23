"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { serif } from "@/lib/fonts";
import { useTheme } from "@/app/components/themeProvider";
import { LanguagePicker } from "@/app/components/languagePicker";

/**
 * Stone Harbor — CrisisFooter.
 *
 * The canonical "If you are in crisis · 988" band that sits at the
 * bottom of every authenticated page. Theme-aware (Sunlit cream vs.
 * Dusk dark-glass).
 *
 * What the footer carries now — and what moved out:
 *
 *   Stage 1 (early): Brand anchor + wordmark + tagline on the left,
 *   "The harbor is patient." line in the center, 988 on the right.
 *   Three columns of identity + voice + safety.
 *
 *   Stage 2 (mid): Brand wordmark removed — the top header carries
 *   identity on every authenticated route, so the footer didn't need
 *   to duplicate it. The breathing anchor and patience line stayed.
 *
 *   Stage 3 (current): Breathing anchor and "The harbor is patient."
 *   moved INTO the journal reader's fleuron tailpiece, where the
 *   harbor mark + voice live at the place the writing was held. The
 *   footer now does one job — surface the crisis line — and gets out
 *   of the way. The brand voice signature lives at the entry's close;
 *   the safety line lives at the page's close. They no longer compete
 *   with each other in the same band.
 *
 * Layout: single centered column with the "If You Are In Crisis · 988"
 * block on top, and a quieter language picker + legal links row below.
 * No grid, no left/center fill — just the band and its utility row.
 *
 * Optional: pass `amplify988` to render the Stone-Harbor-voice
 * follow-on line ("Tonight more than most nights, you are not alone.")
 * — used on the dashboard when the day's acknowledgment context calls
 * for it. Defaults to false so other pages stay quiet.
 */
type Props = {
  /** Render the additional warm line under the 988 block. */
  amplify988?: boolean;
};

export function CrisisFooter({ amplify988 = false }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const t = useTranslations("crisisFooter");
  const tResources = useTranslations("crisisResources");

  return (
    <footer
      data-crisis-footer="true"
      // Mounted at body level (see globalCrisisFooter.tsx + layout.tsx),
      // so the footer is a direct child of <body> and naturally spans
      // the full 100vw.
      //
      // Padding tightened (py-4 md:py-6 → py-3 md:py-4) now that the
      // band carries only the 988 line + utility row. The previous
      // padding sized the band to hold three columns of content; with
      // a single centered column it would feel oversize.
      className={`relative z-10 w-full border-t px-4 py-3 backdrop-blur-sm md:px-6 md:py-4 ${
        isDusk
          ? "border-white/10 bg-black/60"
          : "border-stone-200 bg-[var(--sh-bg-card-tinted-hover)]/70"
      }`}
    >
      {/* Crisis line — single centered column. The 988 number itself
          stays untranslated (US Suicide & Crisis Lifeline, brand-fixed);
          the surrounding copy localizes. max-w-xl caps the readable
          measure so the line doesn't sprawl across very wide viewports. */}
      <div className="mx-auto max-w-xl text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-text-tertiary)]">
          {t("crisisLabel")}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          {t("crisisLineStart")}{" "}
          <span className="font-bold text-[var(--sh-accent-gold)]">988</span>{" "}
          {t("crisisLineEnd")}
        </p>
        {amplify988 && (
          <p
            className={`${serif.className} mt-2 text-base italic leading-snug text-[var(--sh-accent-gold-sunlit)]`}
          >
            {t("amplify")}
          </p>
        )}
        {/* SH-105: the 988 line is the immediate answer; /crisis-resources
            is the deeper directory behind it. This link sits inside the
            crisis block rather than in the utility row below, because it
            is a crisis link, not a legal one — the row's <nav> is
            aria-labelled "Legal links" and should stay honest about what
            it holds. Copy lives in the crisisResources namespace so the
            footer's own keys are untouched. */}
        <Link
          href="/crisis-resources"
          className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-accent-gold)]"
        >
          {tResources("footerLink")}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Language picker + legal links — quiet utility row below the
          crisis line. Privacy + Terms links added 2026-06-06 (SH-8)
          so the legal notices are reachable from every authenticated
          surface, not only the /register checkbox. Small uppercase
          microcopy so they recede from the 988 messaging that owns
          the band.

          Spacing tightened (mt-3 pt-3 md:mt-4 → mt-2.5 pt-2.5 md:mt-3)
          to match the band's slimmer overall height. */}
      <div className="mx-auto mt-2.5 flex max-w-7xl flex-col items-center gap-3 border-t border-[var(--sh-border-subtle)] pt-2.5 md:mt-3 md:flex-row md:justify-between md:pt-3">
        <LanguagePicker />
        <nav
          aria-label={t("legalAria")}
          className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]"
        >
          <Link
            href="/privacy"
            className="transition hover:text-[var(--sh-accent-gold)]"
          >
            {t("privacy")}
          </Link>
          <span aria-hidden="true" className="opacity-50">
            ·
          </span>
          <Link
            href="/terms"
            className="transition hover:text-[var(--sh-accent-gold)]"
          >
            {t("terms")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
