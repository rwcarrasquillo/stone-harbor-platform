"use client";

/**
 * Stone Harbor — Settle-in.
 *
 * The threshold a new member crosses once, after onboarding, before the
 * dashboard. Five quiet screens that slow the member down, name the
 * harbor's no-chase posture, introduce the four doors and the Map, and
 * make the crisis line a permanent fixture rather than a hidden footer.
 *
 * Copy is LOCKED (Stone_Harbor_Settle_In_Copy.md) and lives in the
 * `settleIn` i18n namespace (en + es). Nothing here invents voice.
 *
 * Step state is held in the URL (`?step=1`..`?step=5`, default 1) so the
 * browser back button walks back through the flow. The dashboard server
 * gate sends first-pass members here; finishing writes
 * settle_in_completed_at, skipping writes settle_in_skipped_at — either
 * clears the gate. Revisits (from /welcome) write neither.
 *
 * SH-109 (spine Ship 1) adds a SIXTH screen — "Where to begin" — which
 * renders only when `app_settings.spine_enabled` is true. It carries the
 * soft starting-step picker (Calm 1 pre-selected, the whole 15-step path
 * one tap away) and moves the enter-the-harbor gesture onto itself, so
 * the step the member chose rides along with the completion write. With
 * the flag off the flow is exactly the five screens it has always been.
 *
 * Motion is calibrated to the brand voice — opacity only, breath-paced,
 * and fully disabled under `prefers-reduced-motion: reduce`.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { serif, sans } from "@/lib/fonts";
import { EASE } from "@/lib/motion";
import { PageAmbience } from "@/app/components/pageAmbience";
import { BreathCircle, useBreathCycle } from "@/app/components/breathCircle";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  getAllSteps,
  getSpineEnabled,
  groupStepsByStage,
  suggestedStartingStep,
  type RoadmapStep,
} from "@/lib/spine";

const STEP_MIN = 1;
/** The five locked settle-in screens. */
const STEP_MAX = 5;
/** With the spine flag on, "Where to begin" sits one past the last. */
const STEP_MAX_SPINE = 6;

const GOLD = "#c4934e";
const MOSS = "#586558";
const MOSS_RGB = "88,101,88";
const GOLD_DEEP = "#a9793d";
const GOLD_DEEP_RGB = "169,121,61";
const STAGGER = 0.25; // standard line-to-line gap (250ms)
const PAUSE = 0.5; // the longer pause before "Quiet." / "Unmoved." (500ms)
const SCREEN_FADE = 0.5; // 500ms screen-to-screen crossfade

const CARD_KEYS = ["reflect", "vent", "brotherhood", "breathe"] as const;

/**
 * Stage accents, matching /roadmap's pairing of a solid hex (text/icon)
 * with an RGB triplet (HairlineLens gradient stops). Calm is moss;
 * Clarity and Strength are gold-deep.
 */
const STAGE_ACCENT: Record<string, { hex: string; rgb: string }> = {
  calm: { hex: MOSS, rgb: MOSS_RGB },
  clarity: { hex: GOLD_DEEP, rgb: GOLD_DEEP_RGB },
  strength: { hex: GOLD_DEEP, rgb: GOLD_DEEP_RGB },
};

/**
 * Clamp the `?step=` search param into the valid range. `max` is 5 in
 * the locked flow and 6 once the spine picker is in play, so a member
 * who lands on `?step=6` with the flag off simply sees the last locked
 * screen rather than a blank one.
 */
function clampStep(raw: string | null, max: number): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n)) return STEP_MIN;
  return Math.min(max, Math.max(STEP_MIN, n));
}

/**
 * Cumulative reveal delays for a screen's lines. Each line arrives one
 * STAGGER after the previous, except indices in `pauseIndices`, which get
 * the longer PAUSE before them so the page literally slows on those words.
 */
function lineDelays(count: number, pauseIndices: number[], base: number): number[] {
  const delays: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === 0) {
      delays.push(base);
    } else {
      const gap = pauseIndices.includes(i) ? PAUSE : STAGGER;
      delays.push(delays[i - 1] + gap);
    }
  }
  return delays;
}

/** A block of body lines that fade in one after another. */
function StaggerLines({
  lines,
  pauseIndices = [],
  base = 0,
  reduced,
  className,
}: {
  lines: string[];
  pauseIndices?: number[];
  base?: number;
  reduced: boolean;
  className: string;
}) {
  const delays = lineDelays(lines.length, pauseIndices, base);
  return (
    <>
      {lines.map((line, i) => (
        <motion.p
          key={i}
          className={className}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduced ? { duration: 0 } : { duration: 0.5, delay: delays[i], ease: EASE.patient }
          }
        >
          {line}
        </motion.p>
      ))}
    </>
  );
}

/** Screen 1's already-breathing 60-second box-breath ring. */
function BreathPanel({ reduced }: { reduced: boolean }) {
  const { phase, phaseDuration } = useBreathCycle();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setElapsed((e) => Math.min(60, e + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <BreathCircle
      phase={reduced ? "exhale" : phase}
      phaseDuration={phaseDuration}
      progressFraction={reduced ? undefined : elapsed / 60}
      size="md"
      label={reduced ? "Breathe" : undefined}
    />
  );
}

function SettleInFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settleIn");
  const tSpine = useTranslations("spine");
  const tPillar = useTranslations("pillar");
  const { theme } = useTheme();
  const reduced = useReducedMotion() ?? false;

  // First pass = member has neither completed nor skipped before. Only a
  // first pass writes the timestamps; revisits navigate without recording.
  const [userId, setUserId] = useState<string | null>(null);
  const [isFirstPass, setIsFirstPass] = useState(true);
  const [leaving, setLeaving] = useState(false);

  // SH-109 — spine picker state. `spineEnabled` starts false so the flow
  // renders its locked five screens on first paint and only grows the
  // sixth once app_settings answers. `selectedStepId` seeds to Calm 1
  // (the harbor's suggestion) as soon as the steps land.
  const [spineEnabled, setSpineEnabled] = useState(false);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  const stepMax = spineEnabled ? STEP_MAX_SPINE : STEP_MAX;
  const step = clampStep(searchParams.get("step"), stepMax);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      if (!active) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("settle_in_completed_at, settle_in_skipped_at")
        .eq("id", user.id)
        .single();
      if (!active) return;
      if (data && (data.settle_in_completed_at || data.settle_in_skipped_at)) {
        setIsFirstPass(false);
      }

      // Spine flag + the whole path. roadmap_steps is readable by
      // `authenticated`, so this runs after the auth check above. Both
      // reads fail soft — a null flag or an empty step list simply means
      // the picker never renders and the flow stays at five screens.
      const enabled = await getSpineEnabled(supabase);
      if (!active) return;
      if (!enabled) return;
      const allSteps = await getAllSteps(supabase);
      if (!active || allSteps.length === 0) return;
      setSteps(allSteps);
      setSelectedStepId(suggestedStartingStep(allSteps)?.id ?? null);
      setSpineEnabled(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const goToStep = useCallback(
    (n: number) => {
      const clamped = Math.min(stepMax, Math.max(STEP_MIN, n));
      router.push(`/settle-in?step=${clamped}`, { scroll: false });
    },
    [router, stepMax],
  );

  /**
   * Server-side mark — `/api/settle-in/(complete|skip)` writes the
   * timestamp using the service-role key. Same pattern as SH-4.
   *
   * Returns true on success, false on failure (so the caller can
   * decide whether to navigate anyway). We currently navigate either
   * way because trapping the member on /settle-in if the write fails
   * is worse UX than letting them through — but the auth guard will
   * loop them back, surfacing the failure naturally.
   */
  const markSettleIn = useCallback(
    async (action: "complete" | "skip"): Promise<boolean> => {
      if (!isFirstPass) return true;
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        console.warn("[settle-in] No session token; skipping server write.");
        return false;
      }
      // SH-109 — the chosen starting step rides along with the completion
      // write. Only on `complete`, and only when the picker actually
      // rendered: skipping leaves current_roadmap_step_id NULL, which the
      // dashboard reads as "not yet placed on the path."
      const stepId =
        action === "complete" && spineEnabled ? selectedStepId : null;
      try {
        const res = await fetch(`/api/settle-in/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...(stepId
            ? { body: JSON.stringify({ currentStepId: stepId }) }
            : {}),
        });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; message?: string }
          | null;
        if (!res.ok || !body?.ok) {
          console.error(`[settle-in] /api/settle-in/${action} failed`, {
            status: res.status,
            error: body?.error,
            message: body?.message,
          });
          return false;
        }
        return true;
      } catch (e) {
        console.error(`[settle-in] /api/settle-in/${action} threw`, e);
        return false;
      }
    },
    [isFirstPass, spineEnabled, selectedStepId],
  );

  const handleSkip = useCallback(async () => {
    await markSettleIn("skip");
    window.location.href = "/dashboard";
  }, [markSettleIn]);

  const handleEnter = useCallback(async () => {
    setLeaving(true);
    await markSettleIn("complete");
    window.setTimeout(
      () => {
        window.location.href = "/dashboard";
      },
      reduced ? 0 : 1000,
    );
  }, [markSettleIn, reduced]);

  // text-balance distributes prose evenly across lines, killing the
  // single-word orphan on the last line of multi-line body copy.
  const bodyClass = `${serif.className} text-balance text-xl leading-relaxed text-[var(--sh-text-primary)] md:text-2xl`;
  const ctaClass = `${sans.className} mt-10 inline-block text-sm uppercase tracking-[0.2em] text-[var(--sh-accent-gold)] underline-offset-4 transition hover:underline`;

  const screenContent = useMemo(
    () => renderScreen(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      step,
      reduced,
      t,
      tSpine,
      tPillar,
      theme,
      spineEnabled,
      steps,
      selectedStepId,
      chooserOpen,
    ],
  );

  function renderScreen() {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col items-center text-center">
            <StaggerLines
              lines={t.raw("screen1.lines") as string[]}
              reduced={reduced}
              className={`${bodyClass} mb-6 last:mb-0`}
            />
            <div className="mt-10 flex justify-center">
              <BreathPanel reduced={reduced} />
            </div>
            <button type="button" onClick={() => goToStep(2)} className={ctaClass}>
              {t("screen1.cta")}
            </button>
          </div>
        );
      case 2: {
        const intro = t.raw("screen2.lines") as string[];
        const cardBase = lineDelays(intro.length, [], 0).at(-1)! + 0.4;
        return (
          <div className="text-center">
            <StaggerLines
              lines={intro}
              reduced={reduced}
              className={`${bodyClass} mb-6 last:mb-0`}
            />
            <div className="mx-auto mt-10 grid max-w-xl grid-cols-1 gap-4 text-left md:grid-cols-2">
              {CARD_KEYS.map((key, i) => (
                <motion.div
                  key={key}
                  className="cursor-default rounded-none border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-translucent)] p-5 backdrop-blur-sm transition-shadow duration-300 hover:shadow-md"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { duration: 0.5, delay: cardBase + i * 0.2, ease: EASE.patient }
                  }
                >
                  <h3 className={`${serif.className} text-lg text-[var(--sh-accent-gold)]`}>
                    {t(`screen2.cards.${key}.title`)}
                  </h3>
                  <p
                    className={`${sans.className} mt-2 text-balance text-sm leading-relaxed text-[var(--sh-text-secondary)]`}
                  >
                    {t(`screen2.cards.${key}.body`)}
                  </p>
                </motion.div>
              ))}
            </div>
            <p
              className={`${serif.className} mx-auto mt-8 max-w-xl text-balance text-base italic leading-relaxed text-[var(--sh-text-secondary)]`}
            >
              {t("screen2.footer")}
            </p>
            <button type="button" onClick={() => goToStep(3)} className={ctaClass}>
              {t("screen2.cta")}
            </button>
          </div>
        );
      }
      case 3:
        return (
          <div className="text-center">
            <StaggerLines
              lines={t.raw("screen3.lines") as string[]}
              reduced={reduced}
              className={`${bodyClass} mb-6 last:mb-0`}
            />
            <button type="button" onClick={() => goToStep(4)} className={ctaClass}>
              {t("screen3.cta")}
            </button>
          </div>
        );
      case 4:
        return (
          <div className="text-center">
            <StaggerLines
              lines={t.raw("screen4.lines") as string[]}
              pauseIndices={t.raw("screen4.pauseIndices") as number[]}
              reduced={reduced}
              className={`${bodyClass} mb-6 last:mb-0`}
            />
            <button type="button" onClick={() => goToStep(5)} className={ctaClass}>
              {t("screen4.cta")}
            </button>
          </div>
        );
      case 5: {
        const crisis = t.raw("screen5.crisis") as { number: string; rest: string }[];
        return (
          <div className="text-center">
            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE.patient }}
            >
              <p className={`${bodyClass} mb-8`}>{t("screen5.opener")}</p>
              <p
                className={`${sans.className} mb-4 text-balance text-base text-[var(--sh-text-secondary)]`}
              >
                {t("screen5.conditional")}
              </p>
              {/* SH-20: center the crisis lines to match the rest of the
                  centered flow. Each row now centers on its own midpoint
                  instead of left-anchoring inside a centered block. */}
              <div className="mx-auto mb-6 max-w-md space-y-2 text-center">
                {crisis.map((c) => (
                  <p
                    key={c.number}
                    className={`${sans.className} text-balance text-base leading-relaxed text-[var(--sh-text-secondary)]`}
                  >
                    <span className="font-bold text-[var(--sh-accent-gold)]">{c.number}</span>
                    {c.rest}
                  </p>
                ))}
              </div>
              <p
                className={`${sans.className} mx-auto mb-12 max-w-md text-balance text-sm leading-relaxed text-[var(--sh-text-tertiary)]`}
              >
                {t("screen5.persistence")}
              </p>
              <p
                className={`${serif.className} mb-6 text-balance text-base italic text-[var(--sh-text-secondary)]`}
              >
                {t("screen5.transition")}
              </p>
              {/* SH-109 — with the spine on, the entrance gesture moves
                  to the "Where to begin" screen so the member's chosen
                  step travels with the completion write. This screen
                  then closes on the same quiet "Continue" the three
                  screens before it use. */}
              {spineEnabled ? (
                <button
                  type="button"
                  onClick={() => goToStep(6)}
                  className={ctaClass}
                >
                  {t("screen4.cta")}
                </button>
              ) : (
                <EnterHarborButton label={t("screen5.enter")} onClick={handleEnter} />
              )}
            </motion.div>
          </div>
        );
      }
      case 6: {
        // "Where to begin" — renders only when spine_enabled is true, in
        // which case `steps` is non-empty and `selectedStepId` is seeded
        // to Calm 1. The guard is belt-and-braces for a mid-flight flag
        // flip.
        if (!spineEnabled || steps.length === 0) return null;
        const selected =
          steps.find((s) => s.id === selectedStepId) ?? steps[0];
        const selectedAccent =
          STAGE_ACCENT[selected.stage] ?? STAGE_ACCENT.clarity;
        return (
          <div className="text-center">
            <motion.div
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE.patient }}
            >
              <p
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
              >
                {tSpine("settleIn.eyebrow")}
              </p>
              <p className={`${bodyClass} mt-3`}>{tSpine("settleIn.title")}</p>
              <p
                className={`${sans.className} mx-auto mt-6 max-w-lg text-balance text-base leading-relaxed text-[var(--sh-text-secondary)]`}
              >
                {tSpine("settleIn.framing")}
              </p>

              {/* The harbor's suggestion, already chosen. Tapping a row
                  in the chooser below swaps whichever step sits here. */}
              <div className="mt-10 text-left">
                <StepChoiceCard
                  step={selected}
                  stageLabel={tPillar(selected.stage)}
                  accent={selectedAccent}
                  theme={theme}
                  selected
                />
              </div>

              {/* Secondary affordance — the whole path, one tap away.
                  Selection is client-side only; nothing is written until
                  the member steps into the harbor. */}
              {!chooserOpen ? (
                <button
                  type="button"
                  onClick={() => setChooserOpen(true)}
                  className={ctaClass}
                >
                  {tSpine("settleIn.chooseElsewhere")}
                </button>
              ) : (
                <div className="mt-10 text-left">
                  <p
                    className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
                  >
                    {tSpine("settleIn.stagePickerEyebrow")}
                  </p>
                  <div className="mt-4 space-y-6">
                    {groupStepsByStage(steps).map((group) => {
                      const accent =
                        STAGE_ACCENT[group.stage] ?? STAGE_ACCENT.clarity;
                      return (
                        <div key={group.stage}>
                          <p
                            className="text-[10px] font-bold uppercase tracking-[0.28em]"
                            style={{ color: accent.hex }}
                          >
                            {tPillar(group.stage)}
                          </p>
                          <div className="mt-3 space-y-2">
                            {group.steps.map((s) => (
                              <StepChoiceCard
                                key={s.id}
                                step={s}
                                stageLabel={tPillar(s.stage)}
                                accent={accent}
                                theme={theme}
                                selected={s.id === selected.id}
                                onSelect={() => setSelectedStepId(s.id)}
                                compact
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-12">
                <EnterHarborButton
                  label={t("screen5.enter")}
                  onClick={handleEnter}
                />
              </div>
            </motion.div>
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <PageAmbience />

      {/* Top-center anchor — visual continuity with the harbor, non-interactive. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 opacity-60"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke={GOLD}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="5" r="1.5" />
          <path d="M12 22V8" />
          <path d="M5 12a7 7 0 0 0 14 0" />
          <path d="M8 8h8" />
        </svg>
      </div>

      {/* Skip — never trapped. Records settle_in_skipped_at on first pass. */}
      <button
        type="button"
        onClick={handleSkip}
        className={`${sans.className} absolute right-4 top-5 z-20 text-xs uppercase tracking-[0.18em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-secondary)]`}
      >
        {t("skip")}
      </button>

      <section className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="w-full"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: SCREEN_FADE, ease: EASE.patient }}
          >
            {screenContent}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Leaving crossfade — the threshold into the dashboard. */}
      <AnimatePresence>
        {leaving && (
          <motion.div
            className="fixed inset-0 z-50 bg-[var(--sh-bg-page)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 1, ease: EASE.settle }}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

/**
 * The entrance gesture — large italic serif in harbor gold with a soft
 * underline that brightens and blooms on hover. Extracted so both the
 * locked flow (screen 5) and the spine flow (screen 6) close on exactly
 * the same moment; only its position in the sequence moves.
 */
function EnterHarborButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group inline-block">
      <span
        className={`${serif.className} border-b border-[var(--sh-accent-gold)]/50 pb-1 text-2xl italic text-[var(--sh-accent-gold)] transition-all duration-300 group-hover:border-[var(--sh-accent-gold)] group-hover:[text-shadow:0_0_14px_rgba(196,147,78,0.55)] md:text-3xl`}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * A step as a choosable card — the "Where to begin" picker's only
 * repeated unit (SH-109).
 *
 * Chrome is borrowed wholesale from /roadmap's step cards so settle-in
 * and the path surface speak the same visual language: stage badge +
 * zero-padded position, serif title, quiet description, and a
 * HairlineLens pair when the card is the selected one.
 *
 * `compact` is the chooser-row variant — smaller type, one-line
 * description — versus the full-weight card that carries the harbor's
 * suggestion at the top of the screen. Cards without `onSelect` render
 * as a static panel rather than a button.
 */
function StepChoiceCard({
  step,
  stageLabel,
  accent,
  theme,
  selected,
  onSelect,
  compact = false,
}: {
  step: RoadmapStep;
  stageLabel: string;
  accent: { hex: string; rgb: string };
  theme: "sunlit" | "dusk";
  selected: boolean;
  onSelect?: () => void;
  compact?: boolean;
}) {
  const isDusk = theme === "dusk";
  const body = (
    <>
      {selected && (
        <>
          <HairlineLens position="top" theme={theme} accentRgb={accent.rgb} />
          <HairlineLens position="bottom" theme={theme} accentRgb={accent.rgb} />
        </>
      )}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-[var(--sh-text-muted)]">
          {String(step.position).padStart(2, "0")}
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: accent.hex }}
        >
          {stageLabel}
        </span>
      </div>
      <h3
        className={`${serif.className} mt-2 font-medium text-[var(--sh-text-primary)] ${
          compact ? "text-lg" : "text-2xl"
        }`}
      >
        {step.title}
      </h3>
      {step.description && (
        <p
          className={`${sans.className} mt-2 leading-relaxed text-[var(--sh-text-secondary)] ${
            compact ? "text-[13px]" : "text-sm"
          }`}
        >
          {step.description}
        </p>
      )}
    </>
  );

  const className = `relative w-full text-left transition ${
    compact ? "px-4 py-3" : "p-5"
  } ${
    isDusk
      ? "bg-black/30 backdrop-blur-sm hover:bg-black/40"
      : "bg-[var(--sh-bg-card-tinted)] hover:bg-white/70"
  }`;
  const style = {
    border: `1px solid ${isDusk ? "rgba(255,255,255,0.08)" : "#e7e5e4"}`,
  };

  if (!onSelect) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
}

export default function SettleInPage() {
  return (
    <Suspense fallback={null}>
      <SettleInFlow />
    </Suspense>
  );
}
