"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { serif, sans } from "@/lib/fonts";
import { supabase } from "@/lib/supabaseClient";
import { stampReturnCardShown } from "@/lib/practice";

/**
 * Stone Harbor — dashboard return card (SH-135, /practice PR 2).
 *
 * Design brief §4.2. The first thing a man sees when he comes back
 * after five or more days away:
 *
 *   "Your shape is here."
 *   "Where would you like to begin again?"
 *   Morning · Midday · Evening · Start fresh
 *
 * Everything load-bearing about this card is what it does NOT do.
 * Nothing was sent while he was gone — no email, no notification,
 * zero pressure during the absence. The card exists only at the
 * moment he chose to return on his own. So the framing is present-
 * tense recognition ("your shape is here"), never accounting
 * ("you've been away 12 days"), and there is no count anywhere in it.
 *
 * "Start fresh" is a first-class option, not a demotion: recovery is
 * non-linear, and the shape that carried him six months ago may not
 * carry him now (brief §4.2, decisions §14.5).
 *
 * No explicit dismiss control. The four options ARE the exits, and
 * the 24hr stamp below means it won't follow him around today.
 */

/** The four exits, in the order the day runs. Start fresh comes last. */
const OPTIONS: Array<{
  key: string;
  href: string;
  labelKey: string;
}> = [
  {
    key: "morning",
    href: "/practice?block=morning_anchor",
    labelKey: "returnCard.options.morning",
  },
  {
    key: "midday",
    href: "/practice?block=midday_touch",
    labelKey: "returnCard.options.midday",
  },
  {
    key: "evening",
    href: "/practice?block=evening_close",
    labelKey: "returnCard.options.evening",
  },
  {
    key: "startFresh",
    href: "/practice?reshape=true",
    labelKey: "returnCard.options.startFresh",
  },
];

export function ReturnCard({
  practiceEnabled,
  eligibility,
  userId,
}: {
  practiceEnabled: boolean;
  eligibility: { eligible: boolean } | null;
  userId: string | null;
}) {
  const t = useTranslations("practice");

  const showing = !!practiceEnabled && !!eligibility?.eligible && !!userId;

  // Stamp the 24hr window on mount. Fire-and-forget, same contract as
  // touchLastSeen: if it fails he might see the card once more today,
  // which is a far smaller cost than a blocked render.
  //
  // The effect is declared before any early return so the hook order
  // stays stable across renders; `showing` gates the work inside.
  useEffect(() => {
    if (!showing || !userId) return;
    void stampReturnCardShown(supabase, userId);
  }, [showing, userId]);

  if (!showing) return null;

  return (
    <section className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]">
      <div
        className={`${sans.variable} ${serif.variable} flex w-full flex-col gap-3 rounded-[10px] border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted)] px-5 py-5`}
      >
        <p
          className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
        >
          {t("returnCard.eyebrow")}
        </p>

        <p
          className={`${serif.className} text-[20px] italic leading-[1.35] tracking-[-0.01em] text-[var(--sh-text-primary)]`}
        >
          {t("returnCard.title")}
        </p>

        <p
          className={`${sans.className} text-[13px] leading-[1.6] text-[var(--sh-text-secondary)]`}
        >
          {t("returnCard.body")}
        </p>

        {/* Four exits. Horizontal row above phone width, stacked at
            375px so every target keeps its full 44px. */}
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={option.href}
              style={{ outline: "none", outlineOffset: 0 }}
              className={`${sans.className} flex min-h-[44px] items-center justify-center rounded-[8px] border border-[var(--sh-border-subtle)] px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)] transition-colors hover:border-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold)] sm:justify-start`}
            >
              {t(option.labelKey)}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
