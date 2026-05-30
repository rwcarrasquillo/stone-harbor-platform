"use client";

import { motion } from "framer-motion";
import { serif } from "@/lib/fonts";
import { useTheme } from "@/app/components/themeProvider";
import { LanguagePicker } from "@/app/components/languagePicker";

/**
 * Stone Harbor — CrisisFooter.
 *
 * The canonical "If you are in crisis" banner that sits at the bottom
 * of every authenticated page. Theme-aware (Sunlit cream vs. Dusk
 * dark-glass).
 *
 * Three columns at desktop, stacked on mobile:
 *   1. Anchor glyph + Stone Harbor wordmark (left)
 *   2. "The harbor is patient." (centered, serif italic)
 *   3. "If You Are In Crisis" + 988 (right)
 *
 * Anchor — integrated:
 *   The brand anchor used to be a floating watermark in the bottom-
 *   right corner of every authenticated page. That mechanical dance
 *   (with an IntersectionObserver dodging this footer when it scrolled
 *   into view) is gone. The anchor now lives INSIDE the footer —
 *   paired with the wordmark on the left — so the brand mark is
 *   permanently anchored to the band that anchors the page.
 *
 *   A slow 4-second breathing animation (scale 1 → 1.06, opacity
 *   0.82 → 1) matches the box-breath rhythm members practice on
 *   /meditation. The page itself is now breathing.
 *
 *   The animation uses framer-motion's `animate` prop rather than
 *   styled-jsx — styled-jsx in Next 16 + Turbopack App Router has
 *   compile-time quirks that caused this whole module to fall back
 *   to a stale build during dev.
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

  return (
    <footer
      data-crisis-footer="true"
      // Mounted at body level (see globalCrisisFooter.tsx + layout.tsx),
      // so the footer is a direct child of <body> and naturally spans
      // the full 100vw.
      className={`relative z-10 w-full border-t px-4 py-5 backdrop-blur-sm md:px-6 md:py-10 ${
        isDusk
          ? "border-white/10 bg-black/60"
          : "border-stone-200 bg-[#efe8dc]/70"
      }`}
    >
      <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-3 md:items-center md:gap-6">
        {/* LEFT — anchor glyph + wordmark */}
        <div className="flex items-center gap-3 md:gap-4">
          <motion.span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center md:h-12 md:w-12"
            animate={{
              scale: [1, 1.06, 1],
              opacity: [0.82, 1, 0.82],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "center" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c4934e"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-full w-full"
            >
              {/* Stylized anchor — same glyph the floating watermark used.
                  Slightly heavier stroke (1.2 vs 0.8) for legibility at
                  the smaller footer size. */}
              <circle cx="12" cy="5" r="1.5" />
              <path d="M12 22V8" />
              <path d="M5 12a7 7 0 0 0 14 0" />
              <path d="M8 8h8" />
            </svg>
          </motion.span>
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sh-accent-gold)]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
        </div>

        {/* CENTER — patience line */}
        <div className="text-center">
          <p
            className={`${serif.className} text-base italic text-[var(--sh-text-secondary)]`}
          >
            The harbor is patient.
          </p>
        </div>

        {/* RIGHT — 988 crisis line */}
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-text-tertiary)]">
            If You Are In Crisis
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
            Call or text{" "}
            <span className="font-bold text-[var(--sh-accent-gold)]">988</span>{" "}
            — 24/7. Free. Confidential.
          </p>
          {amplify988 && (
            <p
              className={`${serif.className} mt-3 text-base italic leading-snug text-[#a9793d]`}
            >
              Tonight more than most nights, you are not alone.
            </p>
          )}
        </div>
      </div>

      {/* Language picker — added 2026-05-31 so members on any
          authenticated page can flip the interface language without
          hunting for it. Lives below the main 3-column grid in its
          own row so it doesn't crowd the 988 column. */}
      <div className="mx-auto mt-4 flex max-w-7xl justify-center border-t border-[var(--sh-border-subtle)] pt-4 md:mt-6 md:pt-5">
        <LanguagePicker />
      </div>
    </footer>
  );
}
