"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { AnchorMark } from "@/app/components/anchorMark";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import { serif, sans } from "@/lib/fonts";
import {
  Eye,
  Mountain,
  Wave,
  type IconProps,
} from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

/**
 * Stone Harbor — Roadmap route (production, harbor vocabulary).
 *
 * The path through clarity / calm / strength rendered as a quiet
 * checklist the member can return to at his own pace. Three stages,
 * five steps each, persisted in user_roadmap_progress.
 *
 * Harbor vocabulary applied (2026-06-18):
 *   Replaces the earlier PageAmbience + PageTopNav chrome with the
 *   same anchor-strip + brand-crumb header used by /journal,
 *   /journal/archive, /lineage, /meditation, /messages, /vent.
 *
 * Composition (top → bottom):
 *   - Brand header (anchor + "Stone Harbor · Roadmap" → /dashboard)
 *   - Anchor strip (eyebrow + serif title + subtitle)
 *   - Stage tabs (three buttons — Clarity / Calm / Strength)
 *   - Active stage blurb (one italic line)
 *   - Step list (cards with Mark Complete / Undo)
 *   - Stage-complete celebration (only when 100%)
 *   - Horizon mark + voice signature ("The harbor walks beside you.")
 *   - Crisis footer is provided by the root layout's GlobalCrisisFooter.
 *
 * Mobile-parallel from day one — every breakpoint (header padding,
 * crumb sizing, anchor strip text scale, stage tab grid, step card
 * row → column) is expressed in the same JSX via Tailwind's md:
 * breakpoint. No mobile route, no client-side device detection.
 *
 * Tracked under SH-65 (Harbor vocabulary — simple trio: resources,
 * members-blog, roadmap).
 */

const GOLD_DEEP = "#a9793d";
const GOLD_DEEP_RGB = "169,121,61";
const MOSS = "#586558";
const MOSS_RGB = "88,101,88";

type Stage = "clarity" | "calm" | "strength";

type RoadmapStep = {
  id: string;
  stage: Stage;
  position: number;
  title: string;
  slug: string;
  description: string | null;
};

// Each stage carries both a hex accent (for solid text/icon colors)
// and an RGB triplet (for the HairlineLens gradient stops). Pairing
// them on the same object means we can never get a hairline that
// doesn't match its stage's accent text.
const stages: {
  value: Stage;
  accent: string;
  accentRgb: string;
  Icon: ComponentType<IconProps>;
}[] = [
  { value: "clarity",  accent: GOLD_DEEP, accentRgb: GOLD_DEEP_RGB, Icon: Eye },
  { value: "calm",     accent: MOSS,      accentRgb: MOSS_RGB,      Icon: Wave },
  { value: "strength", accent: GOLD_DEEP, accentRgb: GOLD_DEEP_RGB, Icon: Mountain },
];

function normalizeStage(value: string | null | undefined): Stage {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function RoadmapPage() {
  const t = useTranslations("roadmap");
  const tPillar = useTranslations("pillar");
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [userId, setUserId] = useState<string | null>(null);
  const [userStage, setUserStage] = useState<Stage>("clarity");
  const [activeStage, setActiveStage] = useState<Stage>("clarity");
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  // step_id -> completed_at ISO string
  const [progress, setProgress] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const fail = (msg: string) => setToast({ tone: "error", text: msg });
  const [busyStepId, setBusyStepId] = useState<string | null>(null);

  // Hover-follows-cursor state — same pattern as the journal entry
  // strip and the messages conversation cards. When the user mouses
  // over a stage tab or step card, the engraved-gold hairlines move
  // there.
  //
  // Stage tabs use OVERRIDE semantics: hoveredStage takes precedence
  // over activeStage, so exactly one tab shows hairlines at any
  // moment. The hairlines on the active tab disappear when you hover
  // a different tab and return when you leave.
  //
  // Step cards use ADDITIVE semantics: hover lights up the hovered
  // card while Completed and Up Next cards keep their hairlines. The
  // "completed" visual state is information that shouldn't disappear
  // just because the cursor moved.
  const [hoveredStage, setHoveredStage] = useState<Stage | null>(null);
  const [hoveredStepId, setHoveredStepId] = useState<string | null>(null);

  // Mobile hero + path strip pattern. On phone widths the step list
  // collapses from a 5-card vertical scroll to a single hero card
  // (full description + Mark Complete) plus a compact path strip of
  // the other four steps. Tapping a path-strip row swaps that step
  // into the hero position. Default points at the "Up Next" step so
  // a new arrival sees their current work first, not the empty top
  // of the stage.
  //
  // This state is mobile-only structurally — desktop renders the
  // full vertical list and ignores mobileActiveStepId entirely. We
  // keep it at the page level (not local to the mobile branch) so
  // the value survives stage-tab switches and re-renders without
  // remount churn.
  const [mobileActiveStepId, setMobileActiveStepId] = useState<string | null>(
    null,
  );

  async function loadAll() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    // Suspension gate
    const { data: gateRow } = await supabase
      .from("profiles")
      .select("suspended_at")
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }
    setUserId(user.id);

    const { data: profile } = await supabase
      .from("profiles")
      .select("healing_stage")
      .eq("id", user.id)
      .single();

    const stage = normalizeStage(profile?.healing_stage);
    setUserStage(stage);
    setActiveStage(stage);

    const { data: stepsData, error: stepsErr } = await supabase
      .from("roadmap_steps")
      .select("id, stage, position, title, slug, description")
      .order("stage", { ascending: true })
      .order("position", { ascending: true });

    if (stepsErr) {
      console.error("Could not load roadmap steps:", stepsErr.message);
    }
    setSteps((stepsData ?? []) as RoadmapStep[]);

    const { data: progressData, error: progressErr } = await supabase
      .from("user_roadmap_progress")
      .select("step_id, completed_at")
      .eq("user_id", user.id);

    if (progressErr) {
      console.error("Could not load progress:", progressErr.message);
    }
    const progressMap = new Map<string, string>(
      (progressData ?? []).map(
        (row: { step_id: string; completed_at: string }) => [
          row.step_id,
          row.completed_at,
        ],
      ),
    );
    setProgress(progressMap);

    setLoading(false);
  }

  async function markComplete(stepId: string) {
    if (!userId) return;
    setBusyStepId(stepId);
    const { error } = await supabase.rpc("mark_roadmap_step_complete", {
      step_uuid: stepId,
    });
    if (error) {
      fail(error.message);
    } else {
      const next = new Map(progress);
      next.set(stepId, new Date().toISOString());
      setProgress(next);
    }
    setBusyStepId(null);
  }

  async function unmarkComplete(stepId: string) {
    if (!userId) return;
    const confirmed = window.confirm("Un-mark this step?");
    if (!confirmed) return;
    setBusyStepId(stepId);
    const { error } = await supabase
      .from("user_roadmap_progress")
      .delete()
      .eq("user_id", userId)
      .eq("step_id", stepId);
    if (error) {
      fail(error.message);
    } else {
      const next = new Map(progress);
      next.delete(stepId);
      setProgress(next);
    }
    setBusyStepId(null);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Sync mobileActiveStepId whenever the active stage changes or the
  // step list reloads. Default points at the "Up Next" step so a
  // first arrival sees their current work, not the top of the path.
  // If the current mobileActiveStepId is still valid for the active
  // stage, leave it alone — the user might have manually swapped a
  // different step into the hero position.
  useEffect(() => {
    const stageSteps =
      steps
        .filter((s) => s.stage === activeStage)
        .sort((a, b) => a.position - b.position) ?? [];
    if (stageSteps.length === 0) {
      if (mobileActiveStepId !== null) setMobileActiveStepId(null);
      return;
    }
    const currentValid = stageSteps.some((s) => s.id === mobileActiveStepId);
    if (currentValid) return;
    const nextIdx = stageSteps.findIndex((s) => !progress.has(s.id));
    setMobileActiveStepId(
      nextIdx >= 0 ? stageSteps[nextIdx].id : stageSteps[0].id,
    );
  }, [activeStage, steps, progress, mobileActiveStepId]);

  const stagedSteps = useMemo(() => {
    const grouped = new Map<Stage, RoadmapStep[]>();
    for (const stage of ["clarity", "calm", "strength"] as Stage[]) {
      grouped.set(
        stage,
        steps
          .filter((s) => s.stage === stage)
          .sort((a, b) => a.position - b.position),
      );
    }
    return grouped;
  }, [steps]);

  const stageStats = useMemo(() => {
    const stats = new Map<
      Stage,
      { total: number; completed: number; percent: number; nextIndex: number }
    >();
    for (const stage of ["clarity", "calm", "strength"] as Stage[]) {
      const stageSteps = stagedSteps.get(stage) ?? [];
      const total = stageSteps.length;
      const completed = stageSteps.filter((s) => progress.has(s.id)).length;
      const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
      const nextIndex = stageSteps.findIndex((s) => !progress.has(s.id));
      stats.set(stage, { total, completed, percent, nextIndex });
    }
    return stats;
  }, [stagedSteps, progress]);

  const activeStageSteps = stagedSteps.get(activeStage) ?? [];
  const activeMeta = stages.find((s) => s.value === activeStage);
  const activeAccent = activeMeta?.accent ?? GOLD_DEEP;
  const activeAccentRgb = activeMeta?.accentRgb ?? GOLD_DEEP_RGB;
  const activeStats = stageStats.get(activeStage);

  // ───── Loading state ─────
  // Centered breathing pulse matches the rest of the harbor surfaces
  // (journal, lineage, etc.). min-h-screen so it never collapses to
  // zero height mid-transition (same fix shipped in PR #48 for messages).
  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
      >
        <div className="flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 rounded-full border border-[#c4934e]/30"
            style={{
              background:
                "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
            }}
          />
          <p
            className={`${serif.className} mt-8 text-2xl italic text-[var(--sh-text-secondary)]`}
          >
            {t("eyebrow")}…
          </p>
        </div>
      </main>
    );
  }

  return (
    <div
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />

      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Top brand header =====
            Anchor + "Stone Harbor · Roadmap" → /dashboard. Mobile-parallel:
            tighter padding + smaller text on phone widths, full size on
            md+. Quiet "← Dashboard" link sits in the top-right utility
            slot on desktop only (hidden on phone since the breadcrumb
            already carries the back affordance through the brand link). */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-4 py-4 md:px-10 md:py-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 md:gap-3"
            aria-label="Stone Harbor — Dashboard"
          >
            <AnchorMark size={28} />
            <span
              className={`${serif.className} text-[16px] italic tracking-[-0.012em] text-[var(--sh-text-primary)] md:text-[20px]`}
            >
              Stone Harbor
            </span>
            <span className="text-[14px] text-[var(--sh-text-muted)] md:text-[16px]">
              ·
            </span>
            <span
              className={`${serif.className} text-[16px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)] md:text-[20px]`}
            >
              {t("brandCrumb")}
            </span>
          </Link>

          <Link
            href="/dashboard"
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)] md:block`}
          >
            ← Dashboard
          </Link>
        </header>

        {/* ===== Anchor strip =====
            Eyebrow + serif title + supporting paragraph. Centered on
            the page axis. Same rhythm as /journal/archive's anchor
            strip — uppercase tracked label, italic serif title beneath,
            a quiet subtitle one notch smaller. Mobile shrinks the title
            from 24 → 20 and tightens vertical padding. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-4 py-6 text-center md:px-10 md:py-8">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[20px] italic font-medium tracking-[-0.01em] md:text-[24px]`}
          >
            {t("title")}
          </p>
          <p
            className={`${sans.className} mt-3 max-w-xl text-[12px] leading-relaxed text-[var(--sh-text-secondary)] md:text-[13px]`}
          >
            {t("subtitle")}
          </p>
        </section>

        {/* ===== Body =====
            Stage tabs + active stage blurb + step list, centered inside
            max-w-[1200px] (the harbor's common reading-width for card
            grids). Mobile keeps the same column structure but reduces
            outer padding. */}
        <main className="flex flex-1 flex-col items-center px-4 pb-10 pt-6 md:px-10 md:pb-12 md:pt-10">
          <div className="w-full max-w-[1200px]">
            {/* STAGE TABS */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-6 grid gap-3 sm:grid-cols-3 md:mb-8"
            >
              {stages.map(({ value, accent, accentRgb, Icon }) => {
                const label = tPillar(value);
                const stats = stageStats.get(value) ?? {
                  total: 0,
                  completed: 0,
                  percent: 0,
                  nextIndex: -1,
                };
                const isActive = activeStage === value;
                const isYours = userStage === value;
                // Hover takes precedence over active — the hairlines
                // move to whichever tab the cursor is currently over.
                // Falls back to activeStage when nothing's hovered,
                // so the selected tab keeps its mark when the cursor
                // is elsewhere on the page.
                const showHairlines =
                  (hoveredStage ?? activeStage) === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveStage(value)}
                    onMouseEnter={() => setHoveredStage(value)}
                    onMouseLeave={() =>
                      setHoveredStage((current) =>
                        current === value ? null : current,
                      )
                    }
                    onFocus={() => setHoveredStage(value)}
                    onBlur={() =>
                      setHoveredStage((current) =>
                        current === value ? null : current,
                      )
                    }
                    className={`group relative border p-5 text-left transition focus:outline-none ${
                      isDusk
                        ? "border-white/10"
                        : "border-[var(--sh-border-subtle)]"
                    }`}
                    style={{
                      // Subtler active/inactive separation. Previously
                      // the inactive tabs got an opaque-dark bg
                      // (`rgba(0,0,0,0.30)`) and the active got
                      // pure white, which made Clarity (active by
                      // default) look dramatically brighter than the
                      // other two. The hairlines are doing the
                      // selection signal now — the bg tint just needs
                      // to add a whisper of warmth to the active tab.
                      //
                      // Active sunlit → barely-there warm tint
                      // (`rgba(196,147,78,0.022)`). Active dusk →
                      // barely-there white wash (`0.012`). Both are
                      // about half what the journal entry strip uses;
                      // here the lens hairlines do almost all of the
                      // selection signal and the tint is just a hint
                      // the eye registers without naming. Inactive →
                      // transparent. The page backdrop shows through
                      // and the neutral border carries the structure.
                      backgroundColor: isActive
                        ? isDusk
                          ? "rgba(255,255,255,0.012)"
                          : "rgba(196,147,78,0.022)"
                        : "transparent",
                    }}
                  >
                    {/* Engraved-gold hairlines.
                        Replaces the prior `borderColor: accent` +
                        `inset 0 0 0 1px ${accent}` solid rectangle
                        outline. The lens fades to transparent at both
                        ends, so the tab reads as "this one's selected"
                        without being a hard-edged colored box.
                        Hover-follows-cursor: the lens moves to the
                        tab the cursor is over, falling back to the
                        active tab when nothing's hovered. Same
                        treatment journal entry strip cards use. */}
                    {showHairlines && (
                      <>
                        <HairlineLens
                          position="top"
                          theme={theme}
                          accentRgb={accentRgb}
                        />
                        <HairlineLens
                          position="bottom"
                          theme={theme}
                          accentRgb={accentRgb}
                        />
                      </>
                    )}
                    {/* "Yours" indicator — no box, no rectangle. Just
                        the uppercase tracked label in the stage accent,
                        sitting above the stage name. Reads as
                        annotation, not chrome. */}
                    {isYours && (
                      <span
                        className="absolute -top-2 left-5 z-10 bg-[var(--sh-bg-page)] px-1.5 text-[9px] font-bold uppercase tracking-[0.28em]"
                        style={{ color: accent }}
                      >
                        {t("yoursBadge")}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <Icon
                        size={16}
                        strokeWidth={1.5}
                        style={{ color: accent }}
                      />
                      <span
                        className="text-xs font-bold uppercase tracking-[0.22em]"
                        style={{ color: accent }}
                      >
                        {label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span
                        className={`${serif.className} text-3xl italic`}
                        style={{ color: accent }}
                      >
                        {stats.percent}%
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
                        {t("statsCountOf", {
                          completed: stats.completed,
                          total: stats.total,
                        })}
                      </span>
                    </div>
                    {/* Progress fill — kept as a thin colored bar
                        because it's INFORMATION (percent complete),
                        not chrome. The hairline replaces only the
                        decorative tab outline, never information. */}
                    <div className="mt-3 h-px w-full bg-[var(--sh-border-subtle)]">
                      <div
                        className="h-px transition-all duration-700"
                        style={{
                          width: `${stats.percent}%`,
                          backgroundColor: accent,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </motion.div>

            {/* ACTIVE STAGE BLURB */}
            {activeMeta && (
              <motion.p
                key={activeStage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className={`${serif.className} mb-6 text-lg italic text-[var(--sh-text-secondary)] md:mb-8 md:text-2xl`}
              >
                {t(`stageBlurb.${activeStage}` as
                  | "stageBlurb.clarity"
                  | "stageBlurb.calm"
                  | "stageBlurb.strength")}
              </motion.p>
            )}

            {/* STEP LIST */}
            {activeStageSteps.length === 0 ? (
              <div
                className={`border p-8 text-[var(--sh-text-secondary)] ${
                  isDusk
                    ? "border-white/10 bg-black/30 backdrop-blur-sm"
                    : "border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted)]"
                }`}
              >
                {t("emptyStage")}
              </div>
            ) : (
              <>
                {/* MOBILE — hero + path strip pattern.
                    Phone widths get a single focused hero card showing
                    one step at a time (defaults to the Up Next step),
                    with a compact path strip of the other four below.
                    Tap any path-strip row to swap it into the hero
                    position. Cuts a full five-card scroll down to one
                    short scroll while keeping the whole path visible.
                    Desktop ignores this branch and renders the full
                    vertical list below. */}
                <MobileStepList
                  steps={activeStageSteps}
                  progress={progress}
                  busyStepId={busyStepId}
                  activeAccent={activeAccent}
                  activeAccentRgb={activeAccentRgb}
                  theme={theme}
                  isDusk={isDusk}
                  t={t}
                  mobileActiveStepId={mobileActiveStepId}
                  setMobileActiveStepId={setMobileActiveStepId}
                  markComplete={markComplete}
                  unmarkComplete={unmarkComplete}
                  formatDate={formatDate}
                />
                {/* DESKTOP — full vertical list of every step. */}
                <div className="hidden space-y-3 md:block">
                {activeStageSteps.map((step, idx) => {
                  const completedAt = progress.get(step.id);
                  const isCompleted = !!completedAt;
                  const isNext =
                    !isCompleted && activeStats?.nextIndex === idx;
                  const isBusy = busyStepId === step.id;
                  const isHovered = hoveredStepId === step.id;
                  // Engraved-gold lens with hover-follows-cursor
                  // semantics — same as the stage tabs above and the
                  // journal entry strip. When the user is hovering any
                  // step, only that step shows hairlines; the active
                  // set (Completed + Up Next) yields to the cursor.
                  // When the cursor leaves the list, hairlines snap
                  // back to the active set. The hovered card always
                  // wins so the user sees the visual focus track
                  // their attention.
                  const showHairlines =
                    hoveredStepId !== null
                      ? isHovered
                      : isCompleted || isNext;
                  return (
                    <motion.article
                      key={step.id}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.4, delay: idx * 0.05 }}
                      onMouseEnter={() => setHoveredStepId(step.id)}
                      onMouseLeave={() =>
                        setHoveredStepId((current) =>
                          current === step.id ? null : current,
                        )
                      }
                      className={`relative p-5 transition md:p-6 ${
                        isDusk ? "bg-black/30 backdrop-blur-sm" : "bg-[var(--sh-bg-card-tinted)]"
                      }`}
                      style={{
                        border: `1px solid ${
                          isDusk ? "rgba(255,255,255,0.08)" : "#e7e5e4"
                        }`,
                        opacity: isCompleted ? 0.85 : 1,
                      }}
                    >
                      {showHairlines && (
                        <>
                          <HairlineLens
                            position="top"
                            theme={theme}
                            accentRgb={activeAccentRgb}
                          />
                          <HairlineLens
                            position="bottom"
                            theme={theme}
                            accentRgb={activeAccentRgb}
                          />
                        </>
                      )}
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-[var(--sh-text-muted)]">
                              {String(step.position).padStart(2, "0")}
                            </span>
                            {isCompleted ? (
                              <span
                                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                                style={{ color: activeAccent }}
                              >
                                {t("completed")}
                              </span>
                            ) : isNext ? (
                              <span
                                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                                style={{ color: activeAccent }}
                              >
                                {t("upNext")}
                              </span>
                            ) : null}
                          </div>
                          <h3
                            className={`${serif.className} mt-2 text-xl font-medium text-[var(--sh-text-primary)] md:text-3xl`}
                          >
                            {step.title}
                          </h3>
                          {step.description && (
                            <p className="mt-2 max-w-2xl leading-relaxed text-[var(--sh-text-secondary)]">
                              {step.description}
                            </p>
                          )}
                          {completedAt && (
                            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
                              {t("completedOn", {
                                date: formatDate(completedAt),
                              })}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {isCompleted ? (
                            // Undo — ghost link with engraved-gold
                            // lens hairlines on hover. Reads as a
                            // quiet text affordance, not a button-box.
                            <UndoButton
                              busy={isBusy}
                              label={isBusy ? t("undoing") : t("undo")}
                              onClick={() => unmarkComplete(step.id)}
                              theme={theme}
                            />
                          ) : (
                            // Mark Complete — replaces the prior solid
                            // gold rectangle with a quiet text button
                            // wrapped in top + bottom engraved-gold
                            // hairlines. The hairlines brighten and
                            // the bg lifts on hover; the text color
                            // takes the stage accent. Same affordance
                            // shape /vent's Save button used to land
                            // on after harbor vocabulary v1.
                            <MarkCompleteButton
                              busy={isBusy}
                              label={isBusy ? t("marking") : t("markComplete")}
                              onClick={() => markComplete(step.id)}
                              theme={theme}
                              accent={activeAccent}
                              accentRgb={activeAccentRgb}
                            />
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
                </div>
              </>
            )}

            {/* STAGE COMPLETE — celebration band only when 100% */}
            {activeStats &&
              activeStats.total > 0 &&
              activeStats.percent === 100 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8 }}
                  className={`mt-8 border-y px-6 py-10 text-center backdrop-blur-sm ${
                    isDusk
                      ? "border-white/10 bg-black/30"
                      : "border-[var(--sh-border-subtle)] bg-white/60"
                  }`}
                >
                  <p
                    className={`${serif.className} text-2xl italic md:text-4xl`}
                    style={{ color: activeAccent }}
                  >
                    {t("pathComplete", { stage: tPillar(activeStage) })}
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                    {t("pathCompleteSub")}
                  </p>
                </motion.div>
              )}
          </div>
        </main>

        {/* ===== Horizon mark + voice signature ===== */}
        <RoadmapHorizonMark voiceSignature={t("voiceSignature")} />
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * MobileStepList — phone-width hero + path strip pattern.
 *
 * One focused step shown at full editorial weight at the top (the
 * "hero" — defaults to Up Next, swappable to any step), plus a
 * compact strip of the other four steps below for navigation and
 * scan-ability. Members get the whole path visible in roughly the
 * vertical space the desktop layout used for two of its five cards,
 * and one short scroll covers the entire stage.
 *
 * Hidden on `md:` and above — the desktop layout renders the full
 * vertical card list right beside this component in the JSX.
 */
function MobileStepList({
  steps,
  progress,
  busyStepId,
  activeAccent,
  activeAccentRgb,
  theme,
  isDusk,
  t,
  mobileActiveStepId,
  setMobileActiveStepId,
  markComplete,
  unmarkComplete,
  formatDate,
}: {
  steps: RoadmapStep[];
  progress: Map<string, string>;
  busyStepId: string | null;
  activeAccent: string;
  activeAccentRgb: string;
  theme: "sunlit" | "dusk";
  isDusk: boolean;
  t: (key: string, values?: Record<string, string | number>) => string;
  mobileActiveStepId: string | null;
  setMobileActiveStepId: (id: string | null) => void;
  markComplete: (stepId: string) => Promise<void>;
  unmarkComplete: (stepId: string) => Promise<void>;
  formatDate: (value: string) => string;
}) {
  const heroStep =
    steps.find((s) => s.id === mobileActiveStepId) ?? steps[0] ?? null;
  const nextIdx = steps.findIndex((s) => !progress.has(s.id));

  if (!heroStep) return null;

  const heroCompletedAt = progress.get(heroStep.id);
  const heroIsCompleted = !!heroCompletedAt;
  const heroIsBusy = busyStepId === heroStep.id;

  return (
    <div className="md:hidden">
      {/* HERO — current step at full editorial weight */}
      <motion.article
        key={heroStep.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`relative p-5 ${
          isDusk ? "bg-black/30 backdrop-blur-sm" : "bg-[var(--sh-bg-card-tinted)]"
        }`}
        style={{
          border: `1px solid ${
            isDusk ? "rgba(255,255,255,0.08)" : "#e7e5e4"
          }`,
          opacity: heroIsCompleted ? 0.9 : 1,
        }}
      >
        {/* Hero is always lit — it IS the focus. */}
        <HairlineLens
          position="top"
          theme={theme}
          accentRgb={activeAccentRgb}
        />
        <HairlineLens
          position="bottom"
          theme={theme}
          accentRgb={activeAccentRgb}
        />

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[var(--sh-text-muted)]">
            {String(heroStep.position).padStart(2, "0")}
          </span>
          {heroIsCompleted ? (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: activeAccent }}
            >
              {t("completed")}
            </span>
          ) : steps[nextIdx]?.id === heroStep.id ? (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.22em]"
              style={{ color: activeAccent }}
            >
              {t("upNext")}
            </span>
          ) : null}
        </div>
        <h3
          className={`${serif.className} mt-2 text-2xl font-medium leading-tight text-[var(--sh-text-primary)]`}
        >
          {heroStep.title}
        </h3>
        {heroStep.description && (
          <p className="mt-3 leading-relaxed text-[var(--sh-text-secondary)]">
            {heroStep.description}
          </p>
        )}
        {heroCompletedAt && (
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)]">
            {t("completedOn", { date: formatDate(heroCompletedAt) })}
          </p>
        )}
        <div className="mt-5">
          {heroIsCompleted ? (
            <UndoButton
              busy={heroIsBusy}
              label={heroIsBusy ? t("undoing") : t("undo")}
              onClick={() => unmarkComplete(heroStep.id)}
              theme={theme}
            />
          ) : (
            <MarkCompleteButton
              busy={heroIsBusy}
              label={heroIsBusy ? t("marking") : t("markComplete")}
              onClick={() => markComplete(heroStep.id)}
              theme={theme}
              accent={activeAccent}
              accentRgb={activeAccentRgb}
            />
          )}
        </div>
      </motion.article>

      {/* PATH STRIP — every other step in compact tap-rows */}
      <div className="mt-4 space-y-2">
        {steps
          .filter((step) => step.id !== heroStep.id)
          .map((step) => {
            const isStepCompleted = progress.has(step.id);
            const isStepNext = !isStepCompleted && steps[nextIdx]?.id === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setMobileActiveStepId(step.id)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition ${
                  isDusk
                    ? "bg-black/15 hover:bg-black/25"
                    : "bg-white/40 hover:bg-white/70"
                }`}
                style={{
                  border: `1px solid ${
                    isDusk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"
                  }`,
                  opacity: isStepCompleted ? 0.7 : 1,
                }}
              >
                <span className="text-[10px] font-bold text-[var(--sh-text-muted)]">
                  {String(step.position).padStart(2, "0")}
                </span>
                <span
                  className={`${serif.className} flex-1 truncate text-base italic text-[var(--sh-text-primary)]`}
                >
                  {step.title}
                </span>
                {/* Status dot: solid accent = completed,
                    ring of accent = up next, hollow neutral = queued */}
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: isStepCompleted
                      ? activeAccent
                      : "transparent",
                    border: isStepCompleted
                      ? "none"
                      : `1px solid ${
                          isStepNext
                            ? activeAccent
                            : isDusk
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(0,0,0,0.20)"
                        }`,
                  }}
                />
              </button>
            );
          })}
      </div>
    </div>
  );
}

/**
 * Mark Complete — ghost button wrapped in engraved-gold hairlines.
 *
 * Replaces the previous solid-gold rectangle (`bg-${accent}` + white
 * text + colored border) — the loudest square gold box on /roadmap.
 * New shape: transparent bg, gold text in the stage accent, top and
 * bottom HairlineLens overlays. Hover lifts a faint warm-cream bg
 * tint on sunlit / faint white wash on dusk so the affordance still
 * reads as clickable without becoming a colored block.
 */
function MarkCompleteButton({
  busy,
  label,
  onClick,
  theme,
  accent,
  accentRgb,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  theme: "sunlit" | "dusk";
  accent: string;
  accentRgb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`relative w-full px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] transition disabled:opacity-60 md:w-auto ${
        theme === "sunlit"
          ? "hover:bg-[rgba(196,147,78,0.06)]"
          : "hover:bg-white/[0.04]"
      }`}
      style={{ color: accent }}
    >
      <HairlineLens position="top" theme={theme} accentRgb={accentRgb} />
      <HairlineLens position="bottom" theme={theme} accentRgb={accentRgb} />
      <span className="relative z-10">{label}</span>
    </button>
  );
}

/**
 * Undo — same ghost shape, neutral tertiary text. No hairlines at
 * rest (a completed step's article card already shows hairlines), red
 * tint on hover to signal the destructive intent without resorting
 * to a colored rectangle.
 */
function UndoButton({
  busy,
  label,
  onClick,
  theme,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
  theme: "sunlit" | "dusk";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`w-full px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition hover:text-red-600 disabled:opacity-60 md:w-auto ${
        theme === "sunlit"
          ? "hover:bg-red-50/40"
          : "hover:bg-red-500/[0.05]"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Horizon mark for the /roadmap foot.
 *
 * Same composition as /journal's CenteredHorizonMark and
 * /journal/archive's ArchiveHorizonMark — engraved-gold rule pair +
 * breathing anchor + italic voice signature. Inlined here while the
 * three nearly-identical implementations remain ungeneralized; once
 * we have five of these the right move is to factor the shared
 * fragment into a single HarborHorizonMark component.
 */
function RoadmapHorizonMark({
  voiceSignature,
}: {
  voiceSignature: string;
}) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-4 pb-10 pt-8 md:px-10">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />

        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>

        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>

      <p
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
