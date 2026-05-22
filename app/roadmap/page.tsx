"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { PageAmbience } from "@/app/components/pageAmbience";
import { serif, sans } from "@/lib/fonts";
import {
  Eye,
  Mountain,
  Roadmap as RoadmapIcon,
  Wave,
  type IconProps,
} from "@/app/components/icons";
import { Toast, type ToastState } from "@/app/components/toast";

const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Stage = "clarity" | "calm" | "strength";

type RoadmapStep = {
  id: string;
  stage: Stage;
  position: number;
  title: string;
  slug: string;
  description: string | null;
};

const stages: {
  value: Stage;
  label: string;
  accent: string;
  Icon: ComponentType<IconProps>;
  blurb: string;
}[] = [
  {
    value: "clarity",
    label: "Clarity",
    accent: GOLD_DEEP,
    Icon: Eye,
    blurb: "Name the storm. Trust your perception again.",
  },
  {
    value: "calm",
    label: "Calm",
    accent: MOSS,
    Icon: Wave,
    blurb: "Steady your nervous system. Reclaim your peace.",
  },
  {
    value: "strength",
    label: "Strength",
    accent: GOLD_DEEP,
    Icon: Mountain,
    blurb: "Rebuild structure, boundaries, identity.",
  },
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
  const activeStats = stageStats.get(activeStage);

  // LOADING
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
            className={`${serif.className} mt-8 text-2xl italic text-stone-700`}
          >
            Opening your roadmap…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      {/* Unified harbor ambience — same on every authenticated page */}
      <PageAmbience />

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8 md:px-8">
        {/* TOP NAV */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Return To Harbor
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.28em] text-stone-500 transition hover:text-[#a9793d]"
          >
            Stone Harbor
          </Link>
        </div>

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2">
            <RoadmapIcon size={16} className="text-[#a9793d]" />
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
              Recovery Roadmap
            </p>
          </div>
          <h1
            className={`${serif.className} mt-4 text-5xl font-medium leading-tight text-stone-900 md:text-7xl`}
          >
            Your path.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-stone-600">
            Three stages. Five steps each. Move at your pace. Mark what
            you&apos;ve done.
          </p>
        </motion.div>

        {/* STAGE TABS */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8 grid gap-3 sm:grid-cols-3"
        >
          {stages.map(({ value, label, accent, Icon }) => {
            const stats = stageStats.get(value) ?? {
              total: 0,
              completed: 0,
              percent: 0,
              nextIndex: -1,
            };
            const isActive = activeStage === value;
            const isYours = userStage === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setActiveStage(value)}
                className="relative border p-5 text-left transition focus:outline-none"
                style={{
                  borderColor: isActive ? accent : "#e7e5e4",
                  backgroundColor: isActive ? "white" : "#f8f4ed",
                  boxShadow: isActive ? `inset 0 0 0 1px ${accent}` : undefined,
                }}
              >
                {isYours && (
                  <span
                    className="absolute -right-2 -top-2 z-10 border bg-[#f3efe7] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em]"
                    style={{ borderColor: accent, color: accent }}
                  >
                    Yours
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Icon size={16} strokeWidth={1.5} style={{ color: accent }} />
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                    {stats.completed} of {stats.total}
                  </span>
                </div>
                <div className="mt-3 h-[3px] w-full bg-stone-200">
                  <div
                    className="h-[3px] transition-all duration-700"
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
            className={`${serif.className} mb-8 text-xl italic text-stone-700 md:text-2xl`}
          >
            {activeMeta.blurb}
          </motion.p>
        )}

        {/* STEP LIST */}
        {activeStageSteps.length === 0 ? (
          <div className="border border-stone-200 bg-white p-8 text-stone-600">
            No steps in this stage yet.
          </div>
        ) : (
          <div className="space-y-3">
            {activeStageSteps.map((step, idx) => {
              const completedAt = progress.get(step.id);
              const isCompleted = !!completedAt;
              const isNext = !isCompleted && activeStats?.nextIndex === idx;
              const isBusy = busyStepId === step.id;
              return (
                <motion.article
                  key={step.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className="bg-white p-6 transition"
                  style={{
                    border: `1px solid ${isNext ? activeAccent : "#e7e5e4"}`,
                    borderLeftWidth: isCompleted || isNext ? "3px" : "1px",
                    borderLeftColor:
                      isCompleted || isNext ? activeAccent : undefined,
                    opacity: isCompleted ? 0.85 : 1,
                  }}
                >
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-stone-400">
                          {String(step.position).padStart(2, "0")}
                        </span>
                        {isCompleted ? (
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.22em]"
                            style={{ color: activeAccent }}
                          >
                            ✓ Completed
                          </span>
                        ) : isNext ? (
                          <span
                            className="text-[10px] font-bold uppercase tracking-[0.22em]"
                            style={{ color: activeAccent }}
                          >
                            Up Next
                          </span>
                        ) : null}
                      </div>
                      <h3
                        className={`${serif.className} mt-2 text-2xl font-medium text-stone-900 md:text-3xl`}
                      >
                        {step.title}
                      </h3>
                      {step.description && (
                        <p className="mt-2 max-w-2xl leading-relaxed text-stone-600">
                          {step.description}
                        </p>
                      )}
                      {completedAt && (
                        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
                          Completed {formatDate(completedAt)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      {isCompleted ? (
                        <button
                          type="button"
                          onClick={() => unmarkComplete(step.id)}
                          disabled={isBusy}
                          className="rounded-none border border-stone-300 px-5 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-500 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
                        >
                          {isBusy ? "Undoing…" : "Undo"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markComplete(step.id)}
                          disabled={isBusy}
                          className="group relative overflow-hidden rounded-none border px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105 disabled:opacity-60 disabled:hover:scale-100"
                          style={{
                            backgroundColor: activeAccent,
                            borderColor: activeAccent,
                          }}
                        >
                          <span className="relative z-10">
                            {isBusy ? "Marking…" : "Mark Complete"}
                          </span>
                          <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-white/60 transition-all duration-500 group-hover:w-full" />
                        </button>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        {/* STAGE COMPLETE */}
        {activeStats &&
          activeStats.total > 0 &&
          activeStats.percent === 100 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mt-8 border-y border-stone-200 bg-white/60 px-6 py-10 text-center backdrop-blur-sm"
            >
              <p
                className={`${serif.className} text-3xl italic md:text-4xl`}
                style={{ color: activeAccent }}
              >
                The {activeStage} path is complete.
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-600">
                Sit with that for a moment. The work was yours.
              </p>
            </motion.div>
          )}
      </section>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* FOOTER */}
      <footer className="relative z-10 mt-12 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Call or text <span className="font-bold text-[#a9793d]">988</span>{" "}
              — 24/7. Free. Confidential.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
