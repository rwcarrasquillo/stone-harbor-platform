/**
 * Pillar recommender unit tests.
 *
 * Phase 1's recommender is rule-based; the tests document the rules
 * by checking representative inputs. If a future change re-tunes the
 * weights, these tests are how we catch unintended drift.
 */

import { describe, it, expect } from "vitest";
import { recommendPillar } from "../scoring/recommend-pillar";

describe("recommendPillar (Phase 1 rule-based)", () => {
  it("defaults to clarity when no signals are provided", () => {
    const r = recommendPillar({});
    expect(r.recommendedPillar).toBe("clarity");
  });

  it("recommends calm for high neuroticism + positive PHQ/GAD", () => {
    const r = recommendPillar({
      traits: {
        openness: 3,
        conscientiousness: 3,
        extraversion: 3,
        agreeableness: 3,
        neuroticism: 4.5,
      },
      clinical: { phq2: 4, gad2: 4 },
    });
    expect(r.recommendedPillar).toBe("calm");
  });

  it("recommends strength when conscientiousness is high + neuroticism is low", () => {
    const r = recommendPillar({
      traits: {
        openness: 3,
        conscientiousness: 4.2,
        extraversion: 3,
        agreeableness: 3,
        neuroticism: 2.2,
      },
    });
    expect(r.recommendedPillar).toBe("strength");
  });

  it("recommends strength when competence is starved", () => {
    const r = recommendPillar({
      motivational: {
        autonomySatisfaction: 4,
        autonomyFrustration: 2,
        competenceSatisfaction: 2,
        competenceFrustration: 4,
        relatednessSatisfaction: 4,
        relatednessFrustration: 2,
      },
    });
    expect(r.recommendedPillar).toBe("strength");
  });

  it("recommends clarity when autonomy is starved", () => {
    const r = recommendPillar({
      motivational: {
        autonomySatisfaction: 2,
        autonomyFrustration: 4,
        competenceSatisfaction: 4,
        competenceFrustration: 2,
        relatednessSatisfaction: 4,
        relatednessFrustration: 2,
      },
    });
    expect(r.recommendedPillar).toBe("clarity");
  });

  it("produces a confidence in [0, 1]", () => {
    const r = recommendPillar({
      traits: {
        openness: 3, conscientiousness: 3, extraversion: 3,
        agreeableness: 3, neuroticism: 4.5,
      },
      clinical: { phq2: 4, gad2: 2 },
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("returns alternatives sorted by weight", () => {
    const r = recommendPillar({
      traits: {
        openness: 4, conscientiousness: 3, extraversion: 3,
        agreeableness: 3, neuroticism: 4.5,
      },
    });
    expect(r.alternatives.length).toBe(2);
    expect(r.alternatives[0].weight).toBeGreaterThanOrEqual(
      r.alternatives[1].weight,
    );
  });
});
