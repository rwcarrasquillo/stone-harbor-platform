/**
 * evaluateSafety — Phase 1 safety evaluator.
 *
 * Inspects the user's responses and returns a SafetyAssessment.
 *
 * SH-150 (audit blocker 4): PHQ-2 and GAD-2 are brief SCREENERS. A
 * score ≥3 supports a follow-up conversation (Kroenke 2003, 2007); it
 * does not indicate crisis or imminent risk, and neither instrument
 * asks about suicidal ideation. So a positive screen sets
 * `followUpSuggested` — a neutral "worth checking in" signal — and
 * never raises `level`. Crisis levels stay reserved for instruments
 * that actually assess risk, added only after clinical review:
 *
 *   - PHQ-9 item 9 endorsement (≥1) → severe, non-bypassable.
 *   - PCL-5 ideation items → severe.
 *   - Direct disclosure of intent in open-text fields → severe
 *     (heuristic detection only; consumer handles).
 *
 * The engine does not navigate; it reports. The consumer decides how
 * to present each field.
 */

import type { InstrumentResponse, SafetyAssessment } from "../types";
import { phq2gad2 } from "../instruments/phq2gad2";
import type { Phq2Gad2Response } from "../instruments/phq2gad2";

export function evaluateSafety(
  responses: ReadonlyArray<InstrumentResponse>,
): SafetyAssessment {
  const signals: string[] = [];
  let followUpSuggested = false;

  // Baseline screen responses, if present.
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

      if (klass.phq === "positive") signals.push("phq2.positive_screen");
      if (klass.gad === "positive") signals.push("gad2.positive_screen");
      followUpSuggested = signals.length > 0;
    } catch {
      // Incomplete screen — don't fail safety eval; just skip.
    }
  }

  return {
    // No instrument in scope today assesses crisis risk.
    level: "none",
    signals,
    followUpSuggested,
    recommendsResource: false,
    blockProgression: false,
  };
}
