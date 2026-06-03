/**
 * BFI-10 — Big Five Inventory, 10-item short form.
 *
 * Citation:
 *   Rammstedt, B., & John, O. P. (2007). Measuring personality in
 *   one minute or less: A 10-item short version of the Big Five
 *   Inventory in English and German. Journal of Research in
 *   Personality, 41(1), 203-212. https://doi.org/10.1016/j.jrp.2006.02.001
 *
 * Population: validated in adult English-speaking samples (US/UK,
 * n > 700) with adequate test-retest reliability for a brief screen.
 *
 * What it measures: the Big Five personality dimensions — Openness,
 * Conscientiousness, Extraversion, Agreeableness, Neuroticism. Each
 * subscale is two items, one direct and one reverse-scored, averaged
 * after reversal.
 *
 * Constraints:
 *   - Items use a 5-point Likert scale (1 = strongly disagree,
 *     5 = strongly agree).
 *   - All 10 items must be answered; missing items make the average
 *     unreliable. Phase 1 enforces "no skip" on this instrument; later
 *     phases may allow imputation.
 *   - Reverse items (e.g. "is reserved" for Extraversion) have their
 *     raw score subtracted from 6 before averaging.
 */

export type Bfi10ItemId =
  | "bfi1"   // Extraversion (reverse): "is reserved"
  | "bfi2"   // Agreeableness (reverse): "is generally trusting"  ← NOTE: reverse per Rammstedt & John 2007
  | "bfi3"   // Conscientiousness (reverse): "tends to be lazy"
  | "bfi4"   // Neuroticism (reverse): "is relaxed, handles stress well"
  | "bfi5"   // Openness (reverse): "has few artistic interests"
  | "bfi6"   // Extraversion (direct): "is outgoing, sociable"
  | "bfi7"   // Agreeableness (direct): "tends to find fault with others" ← reversed in scoring
  | "bfi8"   // Conscientiousness (direct): "does a thorough job"
  | "bfi9"   // Neuroticism (direct): "gets nervous easily"
  | "bfi10"; // Openness (direct): "has an active imagination"

export type Bfi10Response = {
  itemId: Bfi10ItemId;
  value: 1 | 2 | 3 | 4 | 5;
};

type Bfi10ItemDef = {
  id: Bfi10ItemId;
  /** English item text. The consumer wraps this in its own voice. */
  textEn: string;
  /** Spanish item text. */
  textEs: string;
  /** Subscale this item loads onto. */
  subscale: keyof Bfi10Scores;
  /** True when the raw value must be reversed (6 - raw) before averaging. */
  reverse: boolean;
};

import type { Bfi10Scores } from "../types";

/**
 * The 10 items.
 *
 * Item text follows Rammstedt & John's English original. Spanish
 * translations are pulled from the validated Spanish adaptation
 * (Benet-Martínez & John, 1998 for the original BFI; for the
 * short-form, see the Rammstedt et al. cross-cultural studies). For
 * the Stone Harbor launch we use the most common adaptation; a
 * licensed bilingual reviewer should verify before Phase 2.
 */
const items: ReadonlyArray<Bfi10ItemDef> = [
  {
    id: "bfi1",
    textEn: "I see myself as someone who is reserved.",
    textEs: "Me considero una persona reservada.",
    subscale: "extraversion",
    reverse: true,
  },
  {
    id: "bfi2",
    textEn: "I see myself as someone who is generally trusting.",
    textEs: "Me considero una persona que generalmente confía en los demás.",
    subscale: "agreeableness",
    reverse: false,
  },
  {
    id: "bfi3",
    textEn: "I see myself as someone who tends to be lazy.",
    textEs: "Me considero una persona que tiende a ser perezosa.",
    subscale: "conscientiousness",
    reverse: true,
  },
  {
    id: "bfi4",
    textEn: "I see myself as someone who is relaxed, handles stress well.",
    textEs: "Me considero una persona relajada, que maneja bien el estrés.",
    subscale: "neuroticism",
    reverse: true,
  },
  {
    id: "bfi5",
    textEn: "I see myself as someone who has few artistic interests.",
    textEs: "Me considero una persona con pocos intereses artísticos.",
    subscale: "openness",
    reverse: true,
  },
  {
    id: "bfi6",
    textEn: "I see myself as someone who is outgoing, sociable.",
    textEs: "Me considero una persona extrovertida y sociable.",
    subscale: "extraversion",
    reverse: false,
  },
  {
    id: "bfi7",
    textEn: "I see myself as someone who tends to find fault with others.",
    textEs: "Me considero una persona que tiende a criticar a los demás.",
    subscale: "agreeableness",
    reverse: true,
  },
  {
    id: "bfi8",
    textEn: "I see myself as someone who does a thorough job.",
    textEs: "Me considero una persona que hace un trabajo minucioso.",
    subscale: "conscientiousness",
    reverse: false,
  },
  {
    id: "bfi9",
    textEn: "I see myself as someone who gets nervous easily.",
    textEs: "Me considero una persona que se pone nerviosa fácilmente.",
    subscale: "neuroticism",
    reverse: false,
  },
  {
    id: "bfi10",
    textEn: "I see myself as someone who has an active imagination.",
    textEs: "Me considero una persona con imaginación activa.",
    subscale: "openness",
    reverse: false,
  },
];

/**
 * Score a complete BFI-10 response set.
 *
 * Returns mean scores per subscale on the original 1..5 scale. Throws
 * if any item is missing — Phase 1 does not impute. The caller is
 * expected to validate completeness before invoking; this is a hard
 * guard to keep partial-data garbage from entering the layer-scores
 * table.
 */
function score(responses: ReadonlyArray<Bfi10Response>): Bfi10Scores {
  const byId = new Map(responses.map((r) => [r.itemId, r.value]));
  const missing = items.filter((it) => !byId.has(it.id)).map((it) => it.id);
  if (missing.length > 0) {
    throw new Error(
      `BFI-10 incomplete: missing items ${missing.join(", ")}. ` +
        `Phase 1 requires all 10 items.`,
    );
  }

  const subscaleSums: Record<keyof Bfi10Scores, number> = {
    openness: 0,
    conscientiousness: 0,
    extraversion: 0,
    agreeableness: 0,
    neuroticism: 0,
  };
  const subscaleCounts: Record<keyof Bfi10Scores, number> = {
    openness: 0,
    conscientiousness: 0,
    extraversion: 0,
    agreeableness: 0,
    neuroticism: 0,
  };

  for (const item of items) {
    const raw = byId.get(item.id) as number;
    const adjusted = item.reverse ? 6 - raw : raw;
    subscaleSums[item.subscale] += adjusted;
    subscaleCounts[item.subscale] += 1;
  }

  return {
    openness: round2(subscaleSums.openness / subscaleCounts.openness),
    conscientiousness: round2(subscaleSums.conscientiousness / subscaleCounts.conscientiousness),
    extraversion: round2(subscaleSums.extraversion / subscaleCounts.extraversion),
    agreeableness: round2(subscaleSums.agreeableness / subscaleCounts.agreeableness),
    neuroticism: round2(subscaleSums.neuroticism / subscaleCounts.neuroticism),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Public bundle. The consumer imports `bfi10` and gets the items
 * (for rendering questions in its UI) and the scoring function.
 */
export const bfi10 = {
  id: "bfi10" as const,
  items,
  score,
  /**
   * Rough qualitative descriptor for a subscale score on 1..5. Used
   * by the chapter generator as raw material — NOT shown to users
   * directly, and NEVER used as a clinical label.
   */
  describe(subscale: keyof Bfi10Scores, value: number): "low" | "mid" | "high" {
    if (value < 2.6) return "low";
    if (value < 3.6) return "mid";
    return "high";
  },
};
