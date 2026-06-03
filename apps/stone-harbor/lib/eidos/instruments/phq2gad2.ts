/**
 * PHQ-2 + GAD-2 — baseline screening used at Module 1.1.
 *
 * Citations:
 *   PHQ-2: Kroenke, K., Spitzer, R. L., & Williams, J. B. W. (2003).
 *     The Patient Health Questionnaire-2: Validity of a two-item
 *     depression screener. Medical Care, 41(11), 1284-1292.
 *   GAD-2: Kroenke, K., Spitzer, R. L., Williams, J. B. W., Monahan,
 *     P. O., & Löwe, B. (2007). Anxiety disorders in primary care:
 *     Prevalence, impairment, comorbidity, and detection. Annals of
 *     Internal Medicine, 146(5), 317-325.
 *
 * What they measure: brief two-item screens. Each is the first two
 * items of the longer PHQ-9 / GAD-7. Score of ≥3 on either is a
 * positive screen that the longer instrument should follow up — in
 * Phase 1, the platform recommends professional consultation rather
 * than administering the longer instruments (those wait for clinical
 * advisor sign-off).
 *
 * IMPORTANT: Neither item in these screens asks about suicidal
 * ideation. PHQ-9 item 9 (the item that does) is intentionally NOT
 * in Phase 1. Active suicidal-ideation detection requires a clinical
 * advisor's review of the safety routing before it ships.
 *
 * Constraints:
 *   - 4-point Likert: 0 = not at all, 1 = several days,
 *     2 = more than half the days, 3 = nearly every day.
 *   - Time window: "Over the past two weeks…"
 *   - Both items in each scale required for that scale's score.
 *   - Either scale may be skipped — the consumer surfaces it as
 *     "prefer not to say" and the engine treats the corresponding
 *     score as null.
 */

import type { Phq2Gad2Scores } from "../types";

export type Phq2Gad2ItemId =
  | "phq1"  // "Little interest or pleasure in doing things"
  | "phq2"  // "Feeling down, depressed, or hopeless"
  | "gad1"  // "Feeling nervous, anxious, or on edge"
  | "gad2"; // "Not being able to stop or control worrying"

export type Phq2Gad2Response = {
  itemId: Phq2Gad2ItemId;
  value: 0 | 1 | 2 | 3 | null; // null = skipped
};

type Phq2Gad2ItemDef = {
  id: Phq2Gad2ItemId;
  textEn: string;
  textEs: string;
  scale: "phq2" | "gad2";
};

const items: ReadonlyArray<Phq2Gad2ItemDef> = [
  {
    id: "phq1",
    textEn: "Little interest or pleasure in doing things.",
    textEs: "Poco interés o placer en hacer las cosas.",
    scale: "phq2",
  },
  {
    id: "phq2",
    textEn: "Feeling down, depressed, or hopeless.",
    textEs: "Sentirse decaído, deprimido o sin esperanzas.",
    scale: "phq2",
  },
  {
    id: "gad1",
    textEn: "Feeling nervous, anxious, or on edge.",
    textEs: "Sentirse nervioso, ansioso o al límite.",
    scale: "gad2",
  },
  {
    id: "gad2",
    textEn: "Not being able to stop or control worrying.",
    textEs: "No poder dejar de preocuparse o controlar la preocupación.",
    scale: "gad2",
  },
];

function score(responses: ReadonlyArray<Phq2Gad2Response>): Phq2Gad2Scores {
  const byId = new Map(responses.map((r) => [r.itemId, r.value]));

  const phq1 = byId.get("phq1");
  const phq2Item = byId.get("phq2");
  const gad1 = byId.get("gad1");
  const gad2Item = byId.get("gad2");

  // If either item in a scale is null, treat the scale as skipped.
  // We use NaN as a sentinel inside this module and convert to a
  // documented value before returning.
  const phq2 =
    phq1 == null || phq2Item == null
      ? NaN
      : (phq1 as number) + (phq2Item as number);
  const gad2 =
    gad1 == null || gad2Item == null
      ? NaN
      : (gad1 as number) + (gad2Item as number);

  return {
    // The caller checks Number.isNaN to detect skip. The type allows
    // number; -1 would be a clearer sentinel but breaks the existing
    // Phq2Gad2Scores type, so we keep NaN for now and document it.
    phq2,
    gad2,
  };
}

/**
 * Convenience: PHQ-2 ≥3 is the standard positive-screen cutoff for
 * the depression screen. Same for GAD-2 ≥3 for anxiety.
 *
 * "severe" here is OUR labeling — it does not correspond to a
 * clinical severity classification on these brief screens. The label
 * is internal-only and consumed by evaluateSafety() to decide whether
 * to surface the crisis-resources modal. We never show this word to
 * users.
 */
function classify(scores: Phq2Gad2Scores): {
  phq: "skipped" | "negative" | "positive";
  gad: "skipped" | "negative" | "positive";
} {
  return {
    phq: Number.isNaN(scores.phq2)
      ? "skipped"
      : scores.phq2 >= 3
        ? "positive"
        : "negative",
    gad: Number.isNaN(scores.gad2)
      ? "skipped"
      : scores.gad2 >= 3
        ? "positive"
        : "negative",
  };
}

export const phq2gad2 = {
  id: "phq2gad2" as const,
  items,
  score,
  classify,
};
