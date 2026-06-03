/**
 * recommendPillar — Phase 1 pillar recommender.
 *
 * Phase 1 uses three signals to suggest one of Stone Harbor's three
 * pillars (Clarity / Calm / Strength). The signals are:
 *
 *   - Neuroticism (BFI-10): high → Calm-leaning
 *   - PHQ-2 / GAD-2: positive screen → Calm-leaning
 *   - BPNSFS starved need:
 *       autonomy → Clarity-leaning (the man needs to see clearly
 *                  what he actually wants)
 *       competence → Strength-leaning (rebuild capability)
 *       relatedness → Calm-leaning (relational regulation first)
 *   - Conscientiousness (BFI-10): high + low neuroticism →
 *       Strength-leaning (already organized; ready to rebuild)
 *   - Openness (BFI-10): high → Clarity-leaning (more comfortable
 *       with the meaning-making work clarity asks for)
 *
 * This is preliminary and will be refined as data comes in from real
 * launch cohorts. The function is intentionally simple — the goal of
 * Phase 1 is to produce a reasonable nudge, not the perfect answer.
 * The button-based self-id remains as the override.
 */

import type {
  Bfi10Scores,
  BpnsfsScores,
  PillarRecommendation,
  Phq2Gad2Scores,
} from "../types";
import { bpnsfs12 } from "../instruments/bpnsfs12";

type Inputs = {
  traits?: Bfi10Scores;
  motivational?: BpnsfsScores;
  clinical?: Phq2Gad2Scores;
};

export function recommendPillar(inputs: Inputs): PillarRecommendation {
  const weights = { clarity: 0, calm: 0, strength: 0 };

  // 1) Neuroticism
  if (inputs.traits) {
    if (inputs.traits.neuroticism >= 3.6) weights.calm += 2;
    else if (inputs.traits.neuroticism <= 2.5) weights.strength += 1;
  }

  // 2) PHQ-2 / GAD-2 positive screen
  if (inputs.clinical) {
    if (!Number.isNaN(inputs.clinical.phq2) && inputs.clinical.phq2 >= 3) {
      weights.calm += 2;
    }
    if (!Number.isNaN(inputs.clinical.gad2) && inputs.clinical.gad2 >= 3) {
      weights.calm += 2;
    }
  }

  // 3) Starved need
  if (inputs.motivational) {
    const starved = bpnsfs12.starvedNeed(inputs.motivational);
    if (starved === "autonomy") weights.clarity += 2;
    if (starved === "competence") weights.strength += 2;
    if (starved === "relatedness") weights.calm += 1;
  }

  // 4) Conscientiousness + low neuroticism → strength bias
  if (inputs.traits) {
    if (
      inputs.traits.conscientiousness >= 3.6 &&
      inputs.traits.neuroticism <= 2.8
    ) {
      weights.strength += 1;
    }
  }

  // 5) Openness → clarity bias (meaning-making fits clarity work)
  if (inputs.traits && inputs.traits.openness >= 3.6) {
    weights.clarity += 1;
  }

  // Default tilt toward clarity if everything balances out — clarity
  // is the lowest-cost entry point and the safest default for a man
  // who hasn't been measured against much yet.
  if (weights.clarity === 0 && weights.calm === 0 && weights.strength === 0) {
    weights.clarity = 1;
  }

  const total = weights.clarity + weights.calm + weights.strength;
  const sorted = (Object.keys(weights) as Array<keyof typeof weights>).sort(
    (a, b) => weights[b] - weights[a],
  );
  const top = sorted[0];
  const confidence =
    total > 0 ? Math.min(1, weights[top] / total) : 0;

  const rationale = buildRationale(top, inputs);

  return {
    recommendedPillar: top,
    confidence: round2(confidence),
    rationale,
    alternatives: sorted.slice(1).map((p) => ({ pillar: p, weight: weights[p] })),
  };
}

function buildRationale(
  pillar: "clarity" | "calm" | "strength",
  inputs: Inputs,
): string {
  // Internal prose — meant as raw material the chapter generator and
  // pillar-recommendation UI surface to the user in voice. NEVER
  // shown verbatim to the user; the consumer wraps it.
  const traitsNote = inputs.traits
    ? `traits: O=${inputs.traits.openness}, C=${inputs.traits.conscientiousness}, N=${inputs.traits.neuroticism}`
    : "traits: unknown";
  const motivNote = inputs.motivational
    ? `starved=${bpnsfs12.starvedNeed(inputs.motivational) ?? "balanced"}`
    : "motivation: unknown";
  const clinNote = inputs.clinical
    ? `phq2=${inputs.clinical.phq2}, gad2=${inputs.clinical.gad2}`
    : "clinical: unknown";

  return `Phase-1 rule-based recommendation: ${pillar}. (${traitsNote}; ${motivNote}; ${clinNote})`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
