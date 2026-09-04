import { describe, expect, it } from "vitest";
import {
  ROADMAP_STAGES,
  normalizeStage,
  parseRoadmapParams,
  resolveMemberStage,
} from "@/lib/roadmap";

/**
 * Stone Harbor — /roadmap deep-link + stage-resolution tests (SH-137).
 *
 * NOTE ON SCOPE: the ship prompt asked for cases phrased against
 * component state ("?stage=calm → activeStage = calm", "highlight
 * timer clears after 1600ms"). Components are deliberately out of this
 * suite — vitest.config.ts says so in as many words, and there is no
 * @testing-library/react in the repo to render one with. So the page's
 * two real decisions were lifted into lib/roadmap.ts and are tested
 * here directly; what's left in the page is wiring (a useEffect, a
 * ref, a setTimeout), which Playwright covers behaviourally.
 *
 * Same location rule as tests/unit/practice.test.ts: vitest collects
 * ONLY tests/unit/**\/*.test.ts, so a suite under lib/__tests__/ would
 * silently never run.
 */

/** Next hands the page a ReadonlyURLSearchParams; the shape we use is `get`. */
const params = (query: string) => new URLSearchParams(query);

// ---------------------------------------------------------------------
// parseRoadmapParams — the ?stage= / ?step= handoff
// ---------------------------------------------------------------------

describe("parseRoadmapParams", () => {
  it("accepts each of the three known stages", () => {
    for (const stage of ROADMAP_STAGES) {
      expect(parseRoadmapParams(params(`stage=${stage}`)).requestedStage).toBe(
        stage,
      );
    }
  });

  it("drops a stage that isn't one of the three", () => {
    expect(parseRoadmapParams(params("stage=invalid")).requestedStage).toBeNull();
  });

  it("drops a stage that only differs by case — the allow-list is exact", () => {
    // normalizeStage is forgiving about stored data; a URL is not
    // stored data, and widening the match here would mean accepting
    // whatever a hand-edited address bar sends.
    expect(parseRoadmapParams(params("stage=Calm")).requestedStage).toBeNull();
  });

  it("returns null for both when no params are present", () => {
    expect(parseRoadmapParams(params(""))).toEqual({
      requestedStage: null,
      requestedStepSlug: null,
    });
  });

  it("passes a step slug through for the caller to resolve", () => {
    expect(
      parseRoadmapParams(params("step=calm-grounding-in-the-body"))
        .requestedStepSlug,
    ).toBe("calm-grounding-in-the-body");
  });

  it("treats an empty or whitespace step as absent", () => {
    expect(parseRoadmapParams(params("step=")).requestedStepSlug).toBeNull();
    expect(parseRoadmapParams(params("step=%20%20")).requestedStepSlug).toBeNull();
  });

  it("reads both params from the href the current-step panel builds", () => {
    expect(
      parseRoadmapParams(params("stage=calm&step=calm-breath-as-anchor")),
    ).toEqual({
      requestedStage: "calm",
      requestedStepSlug: "calm-breath-as-anchor",
    });
  });
});

// ---------------------------------------------------------------------
// resolveMemberStage — Layer 4, the healing_stage repoint
// ---------------------------------------------------------------------

const STEPS = [
  { id: "step-calm-1", stage: "calm" as const },
  { id: "step-clarity-1", stage: "clarity" as const },
  { id: "step-strength-1", stage: "strength" as const },
];

describe("resolveMemberStage", () => {
  it("takes the stage from the member's current step", () => {
    expect(
      resolveMemberStage({
        currentStepId: "step-calm-1",
        steps: STEPS,
        healingStage: "clarity",
      }),
    ).toBe("calm");
  });

  it("lets the step win when healing_stage disagrees", () => {
    // The exact case tests/e2e/spine.spec.ts asserts end-to-end:
    // he declared Strength at signup, the path has him at Calm 1,
    // Calm is the honest answer.
    expect(
      resolveMemberStage({
        currentStepId: "step-calm-1",
        steps: STEPS,
        healingStage: "strength",
      }),
    ).toBe("calm");
  });

  it("falls back to healing_stage when the member has no step", () => {
    expect(
      resolveMemberStage({
        currentStepId: null,
        steps: STEPS,
        healingStage: "strength",
      }),
    ).toBe("strength");
  });

  it("falls back when the stored step id no longer matches a step", () => {
    // A deleted or re-seeded step must not strand the surface on a
    // stage that can't be resolved.
    expect(
      resolveMemberStage({
        currentStepId: "step-that-went-away",
        steps: STEPS,
        healingStage: "calm",
      }),
    ).toBe("calm");
  });

  it("falls back to clarity when there is nothing to go on", () => {
    expect(
      resolveMemberStage({ currentStepId: null, steps: [], healingStage: null }),
    ).toBe("clarity");
  });

  it("resolves against an empty step list without throwing", () => {
    // The steps query failing soft leaves this array empty; the
    // surface still has to pick a tab.
    expect(
      resolveMemberStage({
        currentStepId: "step-calm-1",
        steps: [],
        healingStage: "strength",
      }),
    ).toBe("strength");
  });
});

// ---------------------------------------------------------------------
// normalizeStage — the forgiving read of stored data
// ---------------------------------------------------------------------

describe("normalizeStage", () => {
  it("accepts the three stages in any casing or padding", () => {
    expect(normalizeStage("Calm")).toBe("calm");
    expect(normalizeStage("  STRENGTH ")).toBe("strength");
    expect(normalizeStage("clarity")).toBe("clarity");
  });

  it("still honours the 'strenght' typo that reached production data", () => {
    expect(normalizeStage("strenght")).toBe("strength");
  });

  it("falls back to clarity for null, empty and unknown values", () => {
    expect(normalizeStage(null)).toBe("clarity");
    expect(normalizeStage(undefined)).toBe("clarity");
    expect(normalizeStage("")).toBe("clarity");
    // The five values /profile offers that the live CHECK constraint
    // rejects outright — see the note in the PR body.
    expect(normalizeStage("Rebuilding")).toBe("clarity");
  });
});
