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
