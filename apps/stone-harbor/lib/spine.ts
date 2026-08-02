/**
 * Stone Harbor — app spine helpers (SH-109, Ship 1 foundation).
 *
 * Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Spine_Ship1_Foundation_Design.md
 *
 * The spine turns the app from a toolkit-of-rooms into a path-with-rhythm.
 * Ship 1 gives every member a *current step* on the Roadmap path
 * (`profiles.current_roadmap_step_id`) and surfaces it on the dashboard,
 * /roadmap, and /profile — all behind the `app_settings.spine_enabled`
 * kill switch (defaults false, mirrors the SH-108 `keepers_enabled`
 * pattern).
 *
 * Every helper here takes the caller's Supabase client so the same module
 * serves browser surfaces (the anon client from lib/supabaseClient) and
 * server routes (the service-role client in /api/settle-in/complete).
 * Reads are deliberately forgiving — a failed query degrades to "no
 * spine" rather than blocking a surface the member came for.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RoadmapStage = "calm" | "clarity" | "strength";

export type RoadmapStep = {
  id: string;
  stage: RoadmapStage;
  position: number;
  title: string;
  slug: string;
  description: string | null;
};

/**
 * Read the spine feature flag from app_settings (singleton id=1).
 * Defaults false on error — safe fallback keeps today's behavior.
 */
export async function getSpineEnabled(client: SupabaseClient): Promise<boolean> {
  const { data } = await client
    .from("app_settings")
    .select("spine_enabled")
    .eq("id", 1)
    .maybeSingle();
  return !!data?.spine_enabled;
}

/**
 * Read the Ship 2A content-adaptation flag from app_settings (id=1).
 *
 * Deliberately separate from `spine_enabled`: Ship 1's skeleton (the
 * current-step panel, the /roadmap marker, the Settle-In picker) can be
 * live while content adaptation stays dark until the editorial pass
 * lands. Defaults false on error, same as getSpineEnabled.
 */
export async function getSpineContentEnabled(
  client: SupabaseClient,
): Promise<boolean> {
  const { data } = await client
    .from("app_settings")
    .select("spine_content_enabled")
    .eq("id", 1)
    .maybeSingle();
  return !!data?.spine_content_enabled;
}

/**
 * Both spine flags in ONE round trip.
 *
 * Ship 2A gates on spine_enabled AND spine_content_enabled together,
 * and app_settings is a singleton — so reading them separately costs an
 * extra query on every adapted surface for no benefit. Surfaces that
 * need only one flag keep using the single-flag helpers above.
 */
export async function getSpineFlags(
  client: SupabaseClient,
): Promise<{ spine: boolean; content: boolean }> {
  const { data } = await client
    .from("app_settings")
    .select("spine_enabled, spine_content_enabled")
    .eq("id", 1)
    .maybeSingle();
  return {
    spine: !!data?.spine_enabled,
    content: !!data?.spine_content_enabled,
  };
}

/**
 * What every adapting surface needs to know, in one read.
 *
 * Returns null — meaning "compose exactly as you did before Ship 2A" —
 * whenever content adaptation shouldn't apply: either flag off, the
 * member was never placed on the path, or the stored step id no longer
 * resolves. Callers therefore never need their own flag/null branching;
 * `null` is the whole "behave as before" signal.
 *
 * BOTH flags are required. `spine_content_enabled` alone is not enough:
 * with `spine_enabled` off the member has no visible path at all, and
 * adapting content to a step they can't see reads as the app guessing
 * at them rather than following them.
 */
export type SpineContentContext = {
  step: RoadmapStep;
  /**
   * The step's stage, which is also the value space of the `pillar`
   * column on blog_posts and external_content — see stageMatchesPillar.
   */
  stage: RoadmapStage;
};

/**
 * The cheap form, for surfaces that ALREADY read the member's profile
 * and can hand over current_roadmap_step_id for free — /letters and
 * /resources both do. Costs one flag read, plus one step read only when
 * the flags are actually on. An unplaced member costs nothing at all.
 */
export async function resolveSpineContent(
  client: SupabaseClient,
  currentStepId: string | null | undefined,
): Promise<SpineContentContext | null> {
  try {
    if (!currentStepId) return null;

    const flags = await getSpineFlags(client);
    if (!flags.spine || !flags.content) return null;

    const step = await getStepById(client, currentStepId);
    if (!step) return null;

    return { step, stage: step.stage };
  } catch {
    // A failed read must never cost the member the surface they came
    // for. Degrade to pre-Ship-2A behavior, same contract as Ship 1.
    return null;
  }
}

/**
 * The convenience form, for surfaces with only a user id in hand.
 * Adds one profiles read on top of resolveSpineContent, and skips it
 * entirely when the flags are off — so the off state stays a single
 * query rather than a profile round trip nobody uses.
 */
export async function getSpineContentContext(
  client: SupabaseClient,
  userId: string,
): Promise<SpineContentContext | null> {
  try {
    const flags = await getSpineFlags(client);
    if (!flags.spine || !flags.content) return null;

    const { data: row } = await client
      .from("profiles")
      .select("current_roadmap_step_id")
      .eq("id", userId)
      .maybeSingle();

    return resolveSpineContent(
      client,
      row?.current_roadmap_step_id as string | null | undefined,
    );
  } catch {
    return null;
  }
}

/**
 * CONTENT BINDING MODEL — read this before writing a step-filtered query.
 *
 * Ship 2A adapts on STAGE, not step, and it does so through a column
 * that already exists: both `blog_posts.pillar` and
 * `external_content.pillar` hold exactly 'calm' | 'clarity' |
 * 'strength', which is the same value space as `roadmap_steps.stage`.
 * That is why the surface adaptations in this ship light up the moment
 * the flag flips instead of waiting on an editorial pass — there are
 * 96 letters and 161 resources already carrying a usable pillar.
 *
 * `blog_posts.roadmap_step_id` (added by spine_002_content_binding) is
 * the finer hook. It is NULL on every row today. Ship 2B tags content
 * with it, and every query here prefers a step match when one exists
 * and falls back to the stage match when it doesn't — so 2B's editorial
 * work sharpens these surfaces without another code change.
 */
export function stageMatchesPillar(
  stage: RoadmapStage,
  pillar: string | null | undefined,
): boolean {
  return pillar?.toLowerCase().trim() === stage;
}

/**
 * The week's rhythm for the dashboard invitation (design brief §4.1).
 *
 *   Mon · Thu → a prompt      (from lib/dailyPrompts, stage-preferred)
 *   Tue · Fri → a letter      (blog_posts, step-then-stage matched)
 *   Wed · Sat → a meditation  (a nudge to /meditation)
 *   Sun       → rest, nothing renders
 *
 * Sunday earning nothing is the point: a path with rhythm needs a beat
 * where the harbor asks for nothing at all. The invitation is also
 * absent whenever its class has no content to offer, so quiet days
 * happen naturally beyond Sunday too.
 *
 * `day` is a JS getDay() value (0 = Sunday). Passed in rather than read
 * from the clock so the cadence is testable without faking Date.
 */
export type InvitationClass = "prompt" | "letter" | "meditation";

export function invitationClassForDay(day: number): InvitationClass | null {
  switch (day) {
    case 1:
    case 4:
      return "prompt";
    case 2:
    case 5:
      return "letter";
    case 3:
    case 6:
      return "meditation";
    default:
      return null; // Sunday — rest.
  }
}

/**
 * Fetch a single step by ID. Returns null when not found.
 * Used by dashboard + /profile to render the current-step title.
 */
export async function getStepById(
  client: SupabaseClient,
  stepId: string,
): Promise<RoadmapStep | null> {
  const { data } = await client
    .from("roadmap_steps")
    .select("id, stage, position, title, slug, description")
    .eq("id", stepId)
    .maybeSingle();
  return (data as RoadmapStep | null) ?? null;
}

/**
 * Fetch all 15 steps in canonical path order.
 *
 * STAGE ORDER DEPENDENCY — read before changing this query.
 * The path runs Calm → Clarity → Strength (the nervous system settles
 * before clarity is reachable, and strength built on unresolved calm
 * collapses under pressure — see the Settle-In framing copy). Ordering by
 * the `stage` text column happens to give exactly that sequence because
 * ASCII-alphabetical 'calm' < 'clarity' < 'strength'. That coincidence is
 * load-bearing for findNextStep(), so it is not left to the database:
 * the rows come back grouped by stage and are then re-sorted here against
 * an explicit STAGE_ORDER map. Rename a stage and the map is the one
 * place that has to change.
 *
 * (Note the display order on /roadmap's stage tabs is Clarity · Calm ·
 * Strength — that surface's own tab array, unrelated to path order.)
 */
const STAGE_ORDER: Record<RoadmapStage, number> = {
  calm: 0,
  clarity: 1,
  strength: 2,
};

export async function getAllSteps(client: SupabaseClient): Promise<RoadmapStep[]> {
  const { data } = await client
    .from("roadmap_steps")
    .select("id, stage, position, title, slug, description")
    .order("stage", { ascending: true })
    .order("position", { ascending: true });
  const steps = (data ?? []) as RoadmapStep[];
  return [...steps].sort(
    (a, b) =>
      (STAGE_ORDER[a.stage] ?? 99) - (STAGE_ORDER[b.stage] ?? 99) ||
      a.position - b.position,
  );
}

/**
 * Given the canonical-order steps and a current step ID, return the
 * next step (or null if current is the last one — Strength 5).
 * Used for the dashboard peek-at-next section.
 */
export function findNextStep(
  steps: RoadmapStep[],
  currentStepId: string,
): RoadmapStep | null {
  const idx = steps.findIndex((s) => s.id === currentStepId);
  if (idx < 0 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}

/**
 * Group steps by stage, preserving canonical path order within each
 * group. Used by the Settle-In "Where to begin" chooser, which lists
 * the whole path grouped by stage.
 */
export function groupStepsByStage(
  steps: RoadmapStep[],
): { stage: RoadmapStage; steps: RoadmapStep[] }[] {
  return (["calm", "clarity", "strength"] as RoadmapStage[])
    .map((stage) => ({
      stage,
      steps: steps.filter((s) => s.stage === stage),
    }))
    .filter((group) => group.steps.length > 0);
}

/** The step the harbor suggests when a member hasn't chosen — Calm 1. */
export function suggestedStartingStep(steps: RoadmapStep[]): RoadmapStep | null {
  return (
    steps.find((s) => s.stage === "calm" && s.position === 1) ??
    steps[0] ??
    null
  );
}
