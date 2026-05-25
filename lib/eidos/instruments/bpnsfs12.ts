/**
 * BPNSFS-12 — Basic Psychological Need Satisfaction & Frustration
 * Scale, 12-item short form.
 *
 * Citation:
 *   Chen, B., Vansteenkiste, M., Beyers, W., Boone, L., Deci, E. L.,
 *   Van der Kaap-Deeder, J., et al. (2015). Basic psychological need
 *   satisfaction, need frustration, and need strength across four
 *   cultures. Motivation and Emotion, 39(2), 216-236.
 *   https://doi.org/10.1007/s11031-014-9450-1
 *   Short 12-item version adapted for brief assessment.
 *
 * What it measures: Self-Determination Theory's three basic
 * psychological needs (Deci & Ryan, 2000), each assessed for both
 * satisfaction and frustration:
 *
 *   - Autonomy (Satisfaction / Frustration)
 *   - Competence (Satisfaction / Frustration)
 *   - Relatedness (Satisfaction / Frustration)
 *
 * Why this matters for Stone Harbor: when a man feels stuck or
 * "not himself," it is often because one of these three needs is
 * starving — not always in ways he can name. Need frustration is
 * a stronger predictor of ill-being than need satisfaction alone.
 *
 * Constraints:
 *   - 5-point Likert (1 = completely untrue, 5 = completely true).
 *   - All 12 items required; no imputation in Phase 1.
 *   - No reverse items in this layout — satisfaction items measure
 *     satisfaction directly; frustration items measure frustration
 *     directly. The two are scored as separate subscales.
 */

import type { BpnsfsScores } from "../types";

export type Bpnsfs12ItemId =
  | "bp1" | "bp2"   // Autonomy satisfaction
  | "bp3" | "bp4"   // Autonomy frustration
  | "bp5" | "bp6"   // Competence satisfaction
  | "bp7" | "bp8"   // Competence frustration
  | "bp9" | "bp10"  // Relatedness satisfaction
  | "bp11" | "bp12"; // Relatedness frustration

export type Bpnsfs12Response = {
  itemId: Bpnsfs12ItemId;
  value: 1 | 2 | 3 | 4 | 5;
};

type Bpnsfs12ItemDef = {
  id: Bpnsfs12ItemId;
  textEn: string;
  textEs: string;
  subscale: keyof BpnsfsScores;
};

const items: ReadonlyArray<Bpnsfs12ItemDef> = [
  // Autonomy — satisfaction
  {
    id: "bp1",
    textEn: "I feel a sense of choice and freedom in the things I undertake.",
    textEs: "Siento que tengo libertad y elección en las cosas que hago.",
    subscale: "autonomySatisfaction",
  },
  {
    id: "bp2",
    textEn: "I feel that my decisions reflect what I really want.",
    textEs: "Siento que mis decisiones reflejan lo que realmente quiero.",
    subscale: "autonomySatisfaction",
  },
  // Autonomy — frustration
  {
    id: "bp3",
    textEn: "Most of the things I do feel like 'I have to.'",
    textEs: "La mayoría de las cosas que hago las hago porque \"tengo que\".",
    subscale: "autonomyFrustration",
  },
  {
    id: "bp4",
    textEn: "I feel pressured to do too many things.",
    textEs: "Me siento presionado a hacer demasiadas cosas.",
    subscale: "autonomyFrustration",
  },
  // Competence — satisfaction
  {
    id: "bp5",
    textEn: "I feel capable at what I do.",
    textEs: "Me siento capaz en lo que hago.",
    subscale: "competenceSatisfaction",
  },
  {
    id: "bp6",
    textEn: "I feel I can successfully complete difficult tasks.",
    textEs: "Siento que puedo completar con éxito tareas difíciles.",
    subscale: "competenceSatisfaction",
  },
  // Competence — frustration
  {
    id: "bp7",
    textEn: "I feel disappointed with much of what I do.",
    textEs: "Me siento decepcionado con mucho de lo que hago.",
    subscale: "competenceFrustration",
  },
  {
    id: "bp8",
    textEn: "I have serious doubts about whether I can do things well.",
    textEs: "Tengo serias dudas sobre si puedo hacer las cosas bien.",
    subscale: "competenceFrustration",
  },
  // Relatedness — satisfaction
  {
    id: "bp9",
    textEn: "I feel close and connected with other people who are important to me.",
    textEs: "Me siento cercano y conectado con personas importantes para mí.",
    subscale: "relatednessSatisfaction",
  },
  {
    id: "bp10",
    textEn: "I experience a warm feeling with the people I spend time with.",
    textEs: "Experimento una sensación de calidez con las personas con las que paso tiempo.",
    subscale: "relatednessSatisfaction",
  },
  // Relatedness — frustration
  {
    id: "bp11",
    textEn: "I feel that the people who are important to me are cold and distant.",
    textEs: "Siento que las personas importantes para mí son frías y distantes.",
    subscale: "relatednessFrustration",
  },
  {
    id: "bp12",
    textEn: "I feel excluded from the group I want to belong to.",
    textEs: "Me siento excluido del grupo al que quiero pertenecer.",
    subscale: "relatednessFrustration",
  },
];

function score(responses: ReadonlyArray<Bpnsfs12Response>): BpnsfsScores {
  const byId = new Map(responses.map((r) => [r.itemId, r.value]));
  const missing = items.filter((it) => !byId.has(it.id)).map((it) => it.id);
  if (missing.length > 0) {
    throw new Error(
      `BPNSFS-12 incomplete: missing items ${missing.join(", ")}.`,
    );
  }

  const sums: Record<keyof BpnsfsScores, number> = {
    autonomySatisfaction: 0, autonomyFrustration: 0,
    competenceSatisfaction: 0, competenceFrustration: 0,
    relatednessSatisfaction: 0, relatednessFrustration: 0,
  };
  const counts: Record<keyof BpnsfsScores, number> = {
    autonomySatisfaction: 0, autonomyFrustration: 0,
    competenceSatisfaction: 0, competenceFrustration: 0,
    relatednessSatisfaction: 0, relatednessFrustration: 0,
  };

  for (const item of items) {
    const v = byId.get(item.id) as number;
    sums[item.subscale] += v;
    counts[item.subscale] += 1;
  }

  const out = {} as BpnsfsScores;
  for (const k of Object.keys(sums) as Array<keyof BpnsfsScores>) {
    out[k] = round2(sums[k] / counts[k]);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Identify the most-starved need — the one with the largest gap
 * between satisfaction and frustration in the wrong direction. Used
 * by the chapter generator and the pillar recommender.
 */
function starvedNeed(scores: BpnsfsScores): "autonomy" | "competence" | "relatedness" | null {
  const gaps = {
    autonomy: scores.autonomyFrustration - scores.autonomySatisfaction,
    competence: scores.competenceFrustration - scores.competenceSatisfaction,
    relatedness: scores.relatednessFrustration - scores.relatednessSatisfaction,
  };
  const entries = Object.entries(gaps) as Array<["autonomy" | "competence" | "relatedness", number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [top, value] = entries[0];
  return value > 0.5 ? top : null;
}

export const bpnsfs12 = {
  id: "bpnsfs12" as const,
  items,
  score,
  starvedNeed,
};
