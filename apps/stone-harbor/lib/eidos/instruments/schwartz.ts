/**
 * Schwartz Values — short form (PVQ-10 style).
 *
 * Citation:
 *   Schwartz, S. H. (2012). An overview of the Schwartz theory of
 *   basic values. Online Readings in Psychology and Culture, 2(1).
 *   https://doi.org/10.9707/2307-0919.1116
 *   Adapted from the Portrait Values Questionnaire (PVQ-21) and the
 *   ESS short value scale; ten items, one per universal value.
 *
 * What it measures: the ten universal human values Schwartz argues
 * organize motivation across cultures — Self-Direction, Stimulation,
 * Hedonism, Achievement, Power, Security, Conformity, Tradition,
 * Benevolence, Universalism.
 *
 * Constraints:
 *   - 6-point Likert scale (1 = not like me at all, 6 = very much
 *     like me). Note: Schwartz's PVQ uses a 1-6 scale, not 1-5.
 *   - All 10 items required; no imputation in Phase 1.
 *   - No reverse items in this short form.
 *
 * Phase 1 use: this instrument feeds the values layer and contributes
 * to pillar recommendation. The chapter generator uses the top
 * three values to surface what the man cares about most underneath
 * his current state.
 */

import type { SchwartzScores } from "../types";

export type SchwartzItemId =
  | "sv1"   // Self-Direction
  | "sv2"   // Stimulation
  | "sv3"   // Hedonism
  | "sv4"   // Achievement
  | "sv5"   // Power
  | "sv6"   // Security
  | "sv7"   // Conformity
  | "sv8"   // Tradition
  | "sv9"   // Benevolence
  | "sv10"; // Universalism

export type SchwartzResponse = {
  itemId: SchwartzItemId;
  value: 1 | 2 | 3 | 4 | 5 | 6;
};

type SchwartzItemDef = {
  id: SchwartzItemId;
  textEn: string;
  textEs: string;
  subscale: keyof SchwartzScores;
};

const items: ReadonlyArray<SchwartzItemDef> = [
  {
    id: "sv1",
    textEn: "Thinking up new ideas and being creative is important to me. I like to do things in my own original way.",
    textEs: "Pensar en nuevas ideas y ser creativo es importante para mí. Me gusta hacer las cosas a mi manera.",
    subscale: "selfDirection",
  },
  {
    id: "sv2",
    textEn: "I look for adventures and like to take risks. I want to have an exciting life.",
    textEs: "Busco aventuras y me gusta correr riesgos. Quiero tener una vida emocionante.",
    subscale: "stimulation",
  },
  {
    id: "sv3",
    textEn: "Having a good time is important to me. I like to spoil myself.",
    textEs: "Pasarlo bien es importante para mí. Me gusta darme caprichos.",
    subscale: "hedonism",
  },
  {
    id: "sv4",
    textEn: "Being very successful is important to me. I hope people will recognize my achievements.",
    textEs: "Tener éxito es importante para mí. Espero que la gente reconozca mis logros.",
    subscale: "achievement",
  },
  {
    id: "sv5",
    textEn: "It is important to me to be in charge and tell others what to do. I want people to do what I say.",
    textEs: "Es importante para mí estar a cargo y decir a los demás qué hacer. Quiero que la gente haga lo que digo.",
    subscale: "power",
  },
  {
    id: "sv6",
    textEn: "Living in secure surroundings is important to me. I avoid anything that might endanger my safety.",
    textEs: "Vivir en un entorno seguro es importante para mí. Evito cualquier cosa que ponga en peligro mi seguridad.",
    subscale: "security",
  },
  {
    id: "sv7",
    textEn: "I believe people should do what they are told. I think people should follow rules at all times.",
    textEs: "Creo que la gente debe hacer lo que se le dice. Pienso que se deben seguir las reglas en todo momento.",
    subscale: "conformity",
  },
  {
    id: "sv8",
    textEn: "I think it is important to be humble and modest, and not to draw attention to myself.",
    textEs: "Pienso que es importante ser humilde y modesto, y no llamar la atención sobre mí mismo.",
    subscale: "tradition",
  },
  {
    id: "sv9",
    textEn: "It's very important to me to help the people around me. I want to care for their well-being.",
    textEs: "Es muy importante para mí ayudar a la gente que me rodea. Quiero cuidar de su bienestar.",
    subscale: "benevolence",
  },
  {
    id: "sv10",
    textEn: "I strongly believe that people should care for nature. Looking after the environment is important to me.",
    textEs: "Creo firmemente que la gente debe cuidar la naturaleza. Cuidar el medio ambiente es importante para mí.",
    subscale: "universalism",
  },
];

function score(responses: ReadonlyArray<SchwartzResponse>): SchwartzScores {
  const byId = new Map(responses.map((r) => [r.itemId, r.value]));
  const missing = items.filter((it) => !byId.has(it.id)).map((it) => it.id);
  if (missing.length > 0) {
    throw new Error(
      `Schwartz Values incomplete: missing items ${missing.join(", ")}.`,
    );
  }

  const out: SchwartzScores = {
    selfDirection: 0, stimulation: 0, hedonism: 0, achievement: 0, power: 0,
    security: 0, conformity: 0, tradition: 0, benevolence: 0, universalism: 0,
  };
  for (const item of items) {
    out[item.subscale] = byId.get(item.id) as number;
  }
  return out;
}

/**
 * Rank the values from most-endorsed to least-endorsed. Used by the
 * chapter generator to identify the top three values to surface.
 */
function rank(scores: SchwartzScores): Array<keyof SchwartzScores> {
  return (Object.keys(scores) as Array<keyof SchwartzScores>).sort(
    (a, b) => scores[b] - scores[a],
  );
}

export const schwartz = {
  id: "schwartz" as const,
  items,
  score,
  rank,
};
