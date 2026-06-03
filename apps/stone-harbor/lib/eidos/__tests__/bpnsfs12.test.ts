/**
 * BPNSFS-12 unit tests.
 *
 * The 12-item scale has two items per (need × valence) subscale, no
 * reverse-scoring — satisfaction items score satisfaction, frustration
 * items score frustration. Tests cover the round-trip from raw
 * responses to subscale means and the starvedNeed() helper that the
 * pillar recommender depends on.
 */

import { describe, it, expect } from "vitest";
import { bpnsfs12 } from "../instruments/bpnsfs12";
import type { BpnsfsScores } from "../types";

/** Build a complete response set with a fixed value. */
function uniform(value: 1 | 2 | 3 | 4 | 5) {
  return bpnsfs12.items.map((it) => ({ itemId: it.id, value }));
}

describe("bpnsfs12 scoring", () => {
  it("averages two items per subscale to the same value when uniform", () => {
    const scores = bpnsfs12.score(uniform(3));
    expect(scores.autonomySatisfaction).toBe(3);
    expect(scores.autonomyFrustration).toBe(3);
    expect(scores.competenceSatisfaction).toBe(3);
    expect(scores.competenceFrustration).toBe(3);
    expect(scores.relatednessSatisfaction).toBe(3);
    expect(scores.relatednessFrustration).toBe(3);
  });

  it("throws when an item is missing", () => {
    const partial = bpnsfs12.items.slice(0, 8).map((it) => ({
      itemId: it.id,
      value: 3 as const,
    }));
    expect(() => bpnsfs12.score(partial)).toThrow(/incomplete/i);
  });
});

describe("bpnsfs12 starvedNeed", () => {
  it("returns null when frustration is not noticeably higher than satisfaction", () => {
    const scores: BpnsfsScores = {
      autonomySatisfaction: 4, autonomyFrustration: 2,
      competenceSatisfaction: 4, competenceFrustration: 2,
      relatednessSatisfaction: 4, relatednessFrustration: 2,
    };
    expect(bpnsfs12.starvedNeed(scores)).toBeNull();
  });

  it("flags competence when competence frustration outpaces satisfaction", () => {
    const scores: BpnsfsScores = {
      autonomySatisfaction: 4, autonomyFrustration: 2,
      competenceSatisfaction: 2, competenceFrustration: 4.5,
      relatednessSatisfaction: 4, relatednessFrustration: 2,
    };
    expect(bpnsfs12.starvedNeed(scores)).toBe("competence");
  });

  it("flags relatedness when relatedness gap is largest", () => {
    const scores: BpnsfsScores = {
      autonomySatisfaction: 4, autonomyFrustration: 2,
      competenceSatisfaction: 4, competenceFrustration: 2,
      relatednessSatisfaction: 1.5, relatednessFrustration: 4.5,
    };
    expect(bpnsfs12.starvedNeed(scores)).toBe("relatedness");
  });

  it("flags autonomy when autonomy gap is largest", () => {
    const scores: BpnsfsScores = {
      autonomySatisfaction: 1, autonomyFrustration: 5,
      competenceSatisfaction: 3, competenceFrustration: 3,
      relatednessSatisfaction: 4, relatednessFrustration: 2,
    };
    expect(bpnsfs12.starvedNeed(scores)).toBe("autonomy");
  });
});
