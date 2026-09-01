"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { sans } from "@/lib/fonts";
import {
  getTimeOfDayBlock,
  hasDeclaredShape,
  type PracticeBlockKey,
  type PracticeShape,
} from "@/lib/practice";

/**
 * Stone Harbor — dashboard Practice card (SH-135, /practice PR 2).
 *
 * Design brief §4.1. One quiet line naming the block that matches the
 * hour: "Morning. Your anchor is walking. Start."
 *
 * This is the scaffold half of the scaffold-vs-chase line (brief §3).
 * It renders only because he already opened the app on his own — no
 * notification fired, no email sent, nothing reached for him while he
 * was away. So it is present-tense recognition, never instruction:
 * no CTA button, no red dot, no urgency, and no reference whatsoever
 * to what he did or didn't do yesterday.
 *
 * Renders nothing at all when the flag is off or he has never declared
 * a shape — the surface is invisible to non-participants.
 */
export function PracticeCard({
  practiceEnabled,
  practiceShape,
}: {
  practiceEnabled: boolean;
  practiceShape: PracticeShape | null;
}) {
  const t = useTranslations("practice");

  // Which block the hour belongs to. Null until after mount: the
  // answer depends on the browser's timezone, so computing it during
  // render would make the server's first paint disagree with the
  // client's. The card reserves its height while null so the cascade
  // below it never jumps.
  const [currentBlock, setCurrentBlock] = useState<PracticeBlockKey | null>(
    null,
  );

  useEffect(() => {
    setCurrentBlock(getTimeOfDayBlock(new Date()));
  }, []);

  if (!practiceEnabled || !hasDeclaredShape(practiceShape) || !practiceShape) {
    return null;
  }

  // Reserve the row before the timezone answer arrives — same height,
  // no content, so nothing shifts when it does.
  if (!currentBlock) {
    return (
      <div className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]">
        <div aria-hidden="true" className="min-h-[44px]" />
      </div>
    );
  }

  const COPY: Record<
    PracticeBlockKey,
    { messageKey: string; valueKey: string }
  > = {
    morning_anchor: { messageKey: "card.morning.template", valueKey: "anchor" },
    midday_touch: { messageKey: "card.midday.template", valueKey: "touch" },
    evening_close: { messageKey: "card.evening.template", valueKey: "close" },
  };

  const { messageKey, valueKey } = COPY[currentBlock];
  const blockText = practiceShape[currentBlock]?.trim() ?? "";

  // He may have named only one or two blocks. If the block matching
  // this hour is the unnamed one, the harbor says nothing rather than
  // inventing a line about an empty string.
  if (!blockText) return null;

  return (
    <div className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]">
      <Link
        href={`/practice?block=${currentBlock}`}
        style={{ outline: "none", outlineOffset: 0 }}
        className={`${sans.className} flex min-h-[44px] w-full items-center rounded-[10px] border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted)] px-5 py-3 text-[13px] leading-[1.6] text-[var(--sh-text-secondary)] transition-colors hover:bg-[var(--sh-bg-card-tinted-hover)] hover:text-[var(--sh-text-primary)]`}
      >
        {/* Truncation is CSS, not JS: the member's own words are never
            cut in the data layer, only in the rendering of this line. */}
        <span className="min-w-0 truncate">
          {t(messageKey, { [valueKey]: blockText })}
        </span>
      </Link>
    </div>
  );
}
