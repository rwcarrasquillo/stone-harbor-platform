/**
 * evaluateSafety — Phase 1 safety evaluator.
 *
 * Inspects the user's responses against the safety rules currently in
 * scope and returns a CrisisLevel + a SafetyAssessment.
 *
 * Phase 1 rules (light):
 *   - PHQ-2 ≥3 → elevated.
 *   - GAD-2 ≥3 → elevated.
 *   - Both ≥3 OR either at 6 (max) → severe.
 *
 * Phase 2 will add (gated by clinical advisor):
 *   - PHQ-9 item 9 endorsement (≥1) → severe, non-bypassable.
 *   - PCL-5 ideation items → severe.
 *   - Direct disclosure of intent in open-text fields → severe
 *     (heuristic detection only; consumer handles).
 *
 * The consumer (Stone Harbor) decides what to do with the level —
 * usually: surface the crisis-resources modal on `elevated`, surface
 * it modally + log a safety event on `severe`. The engine does not
 * navigate; it reports.
 */

import type {
  CrisisLevel,
  InstrumentResponse,
  SafetyAssessment,
} from "../types";
import { phq2gad2 } from "../instruments/phq2gad2";
import type { Phq2Gad2Response } from "../instruments/phq2gad2";

export function evaluateSafety(
  responses: ReadonlyArray<InstrumentResponse>,
): SafetyAssessment {
  const signals: string[] = [];
  let level: CrisisLevel = "none";

  // Pull the baseline screen responses if present.
  const phqGad = responses.filter((r) => r.instrumentId === "phq2gad2");
  if (phqGad.length > 0) {
    try {
      const scores = phq2gad2.score(
        phqGad.map((r) => ({
          itemId: r.itemId,
          value: r.value as Phq2Gad2Response["value"],
        })) as ReadonlyArray<Phq2Gad2Response>,
      );
      const klass = phq2gad2.classify(scores);

      const phqPos = klass.phq === "positive";
      const gadPos = klass.gad === "positive";
      const phqMax = !Number.isNaN(scores.phq2) && scores.phq2 >= 6;
      const gadMax = !Number.isNaN(scores.gad2) && scores.gad2 >= 6;

      if (phqPos) signals.push("phq2.positive");
      if (gadPos) signals.push("gad2.positive");
      if (phqMax) signals.push("phq2.max");
      if (gadMax) signals.push("gad2.max");

      if (phqMax || gadMax || (phqPos && gadPos)) {
        level = "severe";
      } else if (phqPos || gadPos) {
        level = "elevated";
      }
    } catch {
      // Incomplete screen — don't fail safety eval; just skip.
    }
  }

  return {
    level,
    signals,
    recommendsResource: level !== "none",
    blockProgression: false, // Phase 1: surface resources but allow the user to continue if they choose
  };
}
