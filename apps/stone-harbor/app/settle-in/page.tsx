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
import { supabase } from "@/lib/supabaseClient";

const STEP_MIN = 1;
const STEP_MAX = 5;

const GOLD = "#c4934e";
const STAGGER = 0.25; // standard line-to-line gap (250ms)
const PAUSE = 0.5; // the longer pause before "Quiet." / "Unmoved." (500ms)
const SCREEN_FADE = 0.5; // 500ms screen-to-screen crossfade

const CARD_KEYS = ["reflect", "vent", "brotherhood", "breathe"] as const;

/** Clamp the `?step=` search param into the valid 1..5 range. */
function clampStep(raw: string | null): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n)) return STEP_MIN;
  return Math.min(STEP_MAX, Math.max(STEP_MIN, n));
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
  const reduced = useReducedMotion() ?? false;

  const step = clampStep(searchParams.get("step"));

  // First pass = member has neither completed nor skipped before. Only a
  // first pass writes the timestamps; revisits navigate without recording.
  const [userId, setUserId] = useState<string | null>(null);
  const [isFirstPass, setIsFirstPass] = useState(true);
  const [leaving, setLeaving] = useState(false);

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
    })();
    return () => {
      active = false;
    };
  }, []);

  const goToStep = useCallback(
    (n: number) => {
      const clamped = Math.min(STEP_MAX, Math.max(STEP_MIN, n));
      router.push(`/settle-in?step=${clamped}`, { scroll: false });
    },
    [router],
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
      try {
        const res = await fetch(`/api/settle-in/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
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
    [isFirstPass],
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

  const screenContent = useMemo(() => renderScreen(), [step, reduced, t]);

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
              <button type="button" onClick={handleEnter} className="group inline-block">
                <span
                  className={`${serif.className} border-b border-[var(--sh-accent-gold)]/50 pb-1 text-2xl italic text-[var(--sh-accent-gold)] transition-all duration-300 group-hover:border-[var(--sh-accent-gold)] group-hover:[text-shadow:0_0_14px_rgba(196,147,78,0.55)] md:text-3xl`}
                >
                  {t("screen5.enter")}
                </span>
              </button>
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

export default function SettleInPage() {
  return (
    <Suspense fallback={null}>
      <SettleInFlow />
    </Suspense>
  );
}
