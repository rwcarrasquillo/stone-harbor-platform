/**
 * Operating Manual Chapter 1 — "How You Are Wired."
 *
 * The first chapter of the personalized Operating Manual. Generated
 * at the end of Week 1, after Modules 1.1 (baseline), 1.2 (BFI-10
 * traits), 1.3 (Schwartz values), and 1.4 (BPNSFS-12 motivation)
 * complete.
 *
 * What this module does:
 *   1. Assemble the chapter inputs from the user's stored layer
 *      scores into a flat, voice-neutral object the prompt template
 *      can render.
 *   2. Return the inputs + the prompt-template key the consumer
 *      should pass to the AI provider.
 *
 * What this module does NOT do:
 *   - It does not call the AI provider. The consumer does that,
 *     because the consumer owns the provider configuration (admin
 *     app's /security tab) and the prompt-template editor (/prompts).
 *   - It does not write to the database. The consumer persists the
 *     generated body to eidos_chapters.
 *   - It does not produce prose. The literary voice belongs to the
 *     consumer's prompt template.
 *
 * Prompt template key: `eidos.chapter1`. Variables expected:
 *   {{member_name}}        — optional, may be empty
 *   {{language}}           — "en" or "es"
 *   {{trait_summary}}      — qualitative descriptors of the Big Five
 *   {{top_values}}         — top three Schwartz values, comma-separated
 *   {{starved_need}}       — "autonomy" | "competence" | "relatedness" | "balanced"
 *   {{values_context}}     — short prose framing of the man's values
 *   {{motivation_context}} — short prose framing of his needs picture
 */

import type {
  Bfi10Scores,
  BpnsfsScores,
  EidosLocale,
  SchwartzScores,
} from "../types";
import { bfi10 } from "../instruments/bfi10";
import { schwartz } from "../instruments/schwartz";
import { bpnsfs12 } from "../instruments/bpnsfs12";

export type Chapter1Inputs = {
  member_name: string;
  language: EidosLocale;
  trait_summary: string;
  top_values: string;
  starved_need: "autonomy" | "competence" | "relatedness" | "balanced";
  values_context: string;
  motivation_context: string;
};

export type Chapter1Sources = {
  traits: Bfi10Scores;
  values: SchwartzScores;
  motivation: BpnsfsScores;
  memberName?: string;
  language?: EidosLocale;
};

/**
 * Assemble the prompt-template inputs from raw layer scores. The
 * returned object is JSON-serializable and ready to merge into the
 * prompt template.
 */
export function generateChapter1(sources: Chapter1Sources): {
  promptKey: "eidos.chapter1";
  inputs: Chapter1Inputs;
} {
  const memberName = (sources.memberName ?? "").trim();
  const language = sources.language ?? "en";

  // Traits — descriptors per dimension. We pass qualitative labels to
  // the prompt rather than raw numbers; the literary voice handles
  // the rendering.
  const t = sources.traits;
  const traitSummary = [
    `openness: ${bfi10.describe("openness", t.openness)}`,
    `conscientiousness: ${bfi10.describe("conscientiousness", t.conscientiousness)}`,
    `extraversion: ${bfi10.describe("extraversion", t.extraversion)}`,
    `agreeableness: ${bfi10.describe("agreeableness", t.agreeableness)}`,
    `neuroticism: ${bfi10.describe("neuroticism", t.neuroticism)}`,
  ].join(", ");

  // Values — top three.
  const ranked = schwartz.rank(sources.values);
  const topThree = ranked.slice(0, 3);
  const topValues = topThree.join(", ");
  const valuesContext = describeValues(topThree, language);

  // Motivation — starved need (or balanced).
  const starved = bpnsfs12.starvedNeed(sources.motivation);
  const starvedNeed = starved ?? "balanced";
  const motivationContext = describeMotivation(starvedNeed, language);

  return {
    promptKey: "eidos.chapter1",
    inputs: {
      member_name: memberName,
      language,
      trait_summary: traitSummary,
      top_values: topValues,
      starved_need: starvedNeed,
      values_context: valuesContext,
      motivation_context: motivationContext,
    },
  };
}

// ---------- internal helpers ----------

function describeValues(top: string[], lang: EidosLocale): string {
  // Voice-neutral phrasing. The prompt template adds the harbor
  // literary voice on top.
  if (lang === "es") {
    return `Sus tres valores más fuertes en este momento son: ${top.join(", ")}.`;
  }
  return `His three strongest values right now are: ${top.join(", ")}.`;
}

function describeMotivation(
  starved: "autonomy" | "competence" | "relatedness" | "balanced",
  lang: EidosLocale,
): string {
  if (lang === "es") {
    switch (starved) {
      case "autonomy":
        return "Su necesidad de autonomía — sentir que está eligiendo su vida — está actualmente insatisfecha.";
      case "competence":
        return "Su sensación de competencia — sentirse capaz en lo que hace — está actualmente insatisfecha.";
      case "relatedness":
        return "Su sentido de conexión — sentirse cercano a las personas que importan — está actualmente insatisfecho.";
      case "balanced":
      default:
        return "Sus tres necesidades básicas están relativamente equilibradas en este momento.";
    }
  }
  switch (starved) {
    case "autonomy":
      return "His need for autonomy — the felt sense that he is choosing his life — is currently undernourished.";
    case "competence":
      return "His sense of competence — feeling capable at what he does — is currently undernourished.";
    case "relatedness":
      return "His sense of connection — feeling close to people who matter — is currently undernourished.";
    case "balanced":
    default:
      return "His three basic needs are relatively in balance right now.";
  }
}
