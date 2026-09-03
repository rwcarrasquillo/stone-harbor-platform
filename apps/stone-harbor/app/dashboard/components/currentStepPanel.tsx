"use client";

/**
 * Stone Harbor — dashboard current-step panel (SH-109, spine Ship 1).
 *
 * The panel that turns the dashboard from a shelf of rooms into a place
 * where the member is *on* something. Renders only when
 * `app_settings.spine_enabled` is true AND the member has been placed on
 * the path (`profiles.current_roadmap_step_id IS NOT NULL`); otherwise
 * the dashboard composes exactly as it did before the spine landed.
 *
 * Composition top to bottom:
 *   - Small eyebrow — "You're on"
 *   - Serif title — the step's title
 *   - One-line intent — the step's description (thin content; Ship 2
 *     replaces it with a richer `intent` field)
 *   - Peek-at-next — small eyebrow, the next step's title, "When you're
 *     ready." Suppressed on the final step (Strength 5), where there is
 *     no next.
 *   - Soft right-aligned link to /roadmap — "See the whole path →"
 *
 * Visual lineage: the dashboard acknowledgment treatment — 840px width
 * tier on lg+, a single HairlineLens at the top edge (the "lintel of a
 * doorway"), warm farol tint, no box border and no bottom hairline. The
 * panel is a primary surface, not a card in a strip.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { serif, sans } from "@/lib/fonts";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import type { RoadmapStep } from "@/lib/spine";

export function CurrentStepPanel({
  currentStep,
  nextStep,
}: {
  currentStep: RoadmapStep;
  nextStep: RoadmapStep | null;
}) {
  const t = useTranslations("spine");
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  // SH-137 — "See the whole path" hands the member's position to
  // /roadmap through the URL rather than dropping him on the default
  // tab. Both values ride along on the step this panel already
  // renders (lib/spine.ts RoadmapStep), so no new prop and no second
  // query: ?stage= opens the right tab, ?step= brings the card he was
  // just reading about into view.
  //
  // The guard is for shape, not for absence — a rendered panel always
  // has a step. It costs one falsy check to make sure a seed row with
  // a blank slug degrades to the bare path instead of building
  // "/roadmap?stage=calm&step=".
  const roadmapHref =
    currentStep.stage && currentStep.slug
      ? `/roadmap?stage=${encodeURIComponent(
          currentStep.stage,
        )}&step=${encodeURIComponent(currentStep.slug)}`
      : "/roadmap";

  return (
    <section
      className={`relative overflow-hidden px-6 py-7 lg:px-8 lg:py-8 ${
        isDusk
          ? "bg-black/35 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
          : "bg-[var(--sh-bg-card-tinted)] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
      }`}
      style={{
        // Same farol geometry the acknowledgment card uses — a cone of
        // warm light falling from above. Gold-deep on sunlit (visible
        // against cream), white on dusk (visible against near-black).
        backgroundImage: isDusk
          ? "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.015) 60%, transparent 95%)"
          : "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(196,147,78,0.10) 0%, rgba(196,147,78,0.05) 30%, rgba(196,147,78,0.02) 60%, transparent 95%)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
        <HairlineLens position="top" theme={theme} />
      </div>

      <p
        className={`${sans.className} text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
      >
        {t("currentStep.eyebrow")}
      </p>
      <p
        className={`${serif.className} mt-3 text-2xl italic leading-[1.2] text-[var(--sh-text-primary)] md:text-3xl`}
      >
        {currentStep.title}
      </p>
      {/* Seed data carries a description on all 15 steps, but an empty
          one renders nothing rather than an empty line. */}
      {currentStep.description && (
        <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          {currentStep.description}
        </p>
      )}

      {/* Peek-at-next — deliberately one type step down and a shade
          quieter than the primary block. Primary attention on where the
          member is; secondary awareness of what's coming. */}
      {nextStep && (
        <div className="mt-7 border-t border-[var(--sh-border-subtle)] pt-5">
          <p
            className={`${sans.className} text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
          >
            {t("currentStep.next.eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-lg italic text-[var(--sh-text-secondary)]`}
          >
            {nextStep.title}
          </p>
          <p
            className={`${sans.className} mt-1 text-[13px] leading-relaxed text-[var(--sh-text-tertiary)]`}
          >
            {t("currentStep.next.readiness")}
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Link
          href={roadmapHref}
          className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--sh-accent-gold)] hover:underline`}
        >
          {t("currentStep.seeWholePath")}
        </Link>
      </div>
    </section>
  );
}
