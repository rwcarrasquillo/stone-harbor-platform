/**
 * Stone Harbor — /roadmap surface helpers (SH-137).
 *
 * Two pure decisions the roadmap page used to make inline, pulled out
 * here so they can be tested. Components stay out of the unit suite by
 * design (see vitest.config.ts — there is no React testing library in
 * this repo), so the way to cover this behaviour is to make the logic
 * a function and leave only wiring in the page.
 *
 * 1. `parseRoadmapParams` — validate the `?stage=` / `?step=` deep link
 *    the dashboard's current-step panel now sends.
 * 2. `resolveMemberStage` — decide which stage is "yours", from the
 *    member's live position on the path rather than the stage they
 *    declared once at signup.
 *
 * On (2), see the WHICH STAGE IS "YOURS" note below: it is the same
 * repoint SH-120 already shipped on /letters and /resources, arriving
 * late to /roadmap.
 */

export type RoadmapStage = "calm" | "clarity" | "strength";

/** The three stages, in the order the tabs render them. */
export const ROADMAP_STAGES: readonly RoadmapStage[] = [
  "clarity",
  "calm",
  "strength",
] as const;

/**
 * Coerce a stored stage string to one of the three known stages.
 *
 * Kept forgiving on purpose: rows predate the current vocabulary, and
 * "strenght" is a real typo that reached production data. Anything
 * unrecognised falls to clarity, which is what /api/register stamps on
 * a new profile anyway.
 */
export function normalizeStage(value: string | null | undefined): RoadmapStage {
  const lower = value?.toLowerCase().trim();
  if (lower === "calm") return "calm";
  if (lower === "strength" || lower === "strenght") return "strength";
  return "clarity";
}

/**
 * The `?stage=` / `?step=` pair, validated.
 *
 * `stage` is checked against the three known values before it is
 * allowed anywhere near component state — a hand-edited URL can only
 * ever be ignored, never widen the tab set. `step` cannot be validated
 * here (the slug list lives in the database), so it comes back as a
 * trimmed string and the caller resolves it against the loaded steps;
 * an unmatched slug is dropped there.
 *
 * Takes anything with a `get` method so the page can hand it Next's
 * `ReadonlyURLSearchParams` and a test can hand it a plain
 * `URLSearchParams`.
 */
export function parseRoadmapParams(params: {
  get(key: string): string | null;
}): { requestedStage: RoadmapStage | null; requestedStepSlug: string | null } {
  const rawStage = params.get("stage");
  const requestedStage =
    ROADMAP_STAGES.find((stage) => stage === rawStage) ?? null;

  const rawStep = params.get("step")?.trim();
  const requestedStepSlug = rawStep ? rawStep : null;

  return { requestedStage, requestedStepSlug };
}

/**
 * WHICH STAGE IS "YOURS" — read this before changing it back.
 *
 * `profiles.healing_stage` and `profiles.current_roadmap_step_id` are
 * not two copies of one fact. They are two different facts:
 *
 *   - healing_stage is what the member said about himself, once. It is
 *     stamped 'clarity' by /api/register at signup and is editable by
 *     hand in /profile. Nothing on the path ever writes it.
 *   - current_roadmap_step_id is where he actually stands this week.
 *     It is written by exactly one path — /api/settle-in/complete —
 *     which deliberately leaves healing_stage alone.
 *
 * So the two drifting apart is not a bug to be synced away; it is the
 * design. SH-120 settled which one wins for surfaces that ask "where
 * is he now": the step does, because the answer people want is his
 * live position, not a signup-form default he may never have revisited.
 * /letters and /resources have read it that way since Ship 2A, and
 * tests/e2e/spine.spec.ts asserts it outright — healing_stage says
 * strength, the path says Calm 1, Calm wins.
 *
 * /roadmap was the last surface still reading healing_stage directly,
 * which is why tapping "See the whole path" could land a member on a
 * stage he left weeks ago. This function is that fix.
 *
 * Falls back to healing_stage when the member has no step: before
 * Settle-In, the declared stage is the only answer there is.
 */
export function resolveMemberStage(input: {
  /** The member's current step id, or null when unplaced / spine off. */
  currentStepId: string | null;
  /** Every step on the path, as already loaded by the caller. */
  steps: ReadonlyArray<{ id: string; stage: RoadmapStage }>;
  /** `profiles.healing_stage`, the signup-declared fallback. */
  healingStage: string | null | undefined;
}): RoadmapStage {
  const { currentStepId, steps, healingStage } = input;

  if (currentStepId) {
    const placed = steps.find((step) => step.id === currentStepId);
    if (placed) return placed.stage;
  }

  return normalizeStage(healingStage);
}
