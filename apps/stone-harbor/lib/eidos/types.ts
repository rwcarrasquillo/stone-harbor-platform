/**
 * Eidos — shared types.
 *
 * These types are part of the engine's contract. They are deliberately
 * narrow and self-contained: no imports from app/, no imports from
 * Supabase domain code. A future consumer outside Stone Harbor can
 * import these types and have a complete picture of what the engine
 * takes and produces.
 */

// ---------- locales ----------

export type EidosLocale = "en" | "es";

// ---------- instruments ----------

/**
 * A response to a single item on a single instrument. The value is
 * deliberately `unknown` here — each instrument's scorer narrows it to
 * the type it expects (number for Likert items, boolean for ACE items,
 * etc.).
 */
export type InstrumentResponse = {
  instrumentId: InstrumentId;
  itemId: string;
  value: unknown;
  respondedAt?: string; // ISO timestamp
};

/**
 * The set of instruments Eidos currently knows how to score. Adding a
 * new instrument means: (1) implement the scorer in instruments/,
 * (2) add its id here, (3) wire it into score-module.ts.
 */
export type InstrumentId =
  | "bfi10"
  | "schwartz"
  | "bpnsfs12"
  | "phq2gad2";

// ---------- per-instrument score shapes ----------

export type Bfi10Scores = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

export type SchwartzScores = {
  selfDirection: number;
  stimulation: number;
  hedonism: number;
  achievement: number;
  power: number;
  security: number;
  conformity: number;
  tradition: number;
  benevolence: number;
  universalism: number;
};

export type BpnsfsScores = {
  autonomySatisfaction: number;
  autonomyFrustration: number;
  competenceSatisfaction: number;
  competenceFrustration: number;
  relatednessSatisfaction: number;
  relatednessFrustration: number;
};

export type Phq2Gad2Scores = {
  phq2: number; // 0..6
  gad2: number; // 0..6
  // PHQ-2 ≥3 suggests depression screen positive; GAD-2 ≥3 suggests
  // anxiety screen positive. Source: Kroenke et al., 2003 (PHQ-2),
  // Kroenke et al., 2007 (GAD-2).
};

/**
 * Discriminated union of all instrument-level score outputs. Each
 * scorer returns one of these. The aggregator rolls them into a
 * layer-level view.
 */
export type InstrumentScoreResult =
  | { instrumentId: "bfi10"; scores: Bfi10Scores }
  | { instrumentId: "schwartz"; scores: SchwartzScores }
  | { instrumentId: "bpnsfs12"; scores: BpnsfsScores }
  | { instrumentId: "phq2gad2"; scores: Phq2Gad2Scores };

// ---------- layer scores ----------

/**
 * Layers correspond to the ten strata in the Eidos framework. Phase 1
 * touches layers 1, 8, and 9; the others come online as instruments
 * for them get implemented.
 *
 *   1. traits          — Big Five / HEXACO
 *   2. developmental   — attachment, ACE, schemas
 *   3. cognitive       — distortions, metacognition
 *   4. emotional       — regulation, granularity, alexithymia
 *   5. behavioral      — habits, avoidance, activation
 *   6. decision        — bias, dual-process, maximizing
 *   7. relational      — adult attachment, conflict style
 *   8. motivational    — SDT, mindset, regulatory focus
 *   9. values          — Schwartz, ACT values
 *  10. clinical        — PHQ-9, GAD-7, ACE-Q, ASRS-6, AUDIT-C
 */
export type EidosLayer =
  | "traits"
  | "developmental"
  | "cognitive"
  | "emotional"
  | "behavioral"
  | "decision"
  | "relational"
  | "motivational"
  | "values"
  | "clinical";

export type LayerScoreRow = {
  userId: string;
  layer: EidosLayer;
  scores: Record<string, number>;
  computedAt: string; // ISO
};

// ---------- pillar recommendation ----------

/**
 * The pillar names live in the consuming product (Stone Harbor's
 * Clarity / Calm / Strength). The engine produces the recommendation
 * in product-neutral form and the consumer maps it. For a future
 * second product that uses different pillar names, this stays the
 * same — only the consumer's mapping changes.
 */
export type PillarRecommendation = {
  recommendedPillar: "clarity" | "calm" | "strength";
  confidence: number; // 0..1
  rationale: string; // short prose for the consumer's UI
  alternatives: Array<{ pillar: "clarity" | "calm" | "strength"; weight: number }>;
};

// ---------- safety ----------

export type CrisisLevel = "none" | "elevated" | "severe";

export type SafetyAssessment = {
  level: CrisisLevel;
  signals: string[]; // e.g. ["phq2.severe", "gad2.severe"]
  recommendsResource: boolean;
  blockProgression: boolean; // when true, the consumer must surface crisis resources before allowing further progress
};

// ---------- session state ----------

export type EidosSessionStatus =
  | "not_started"
  | "in_progress"
  | "paused"
  | "complete";

export type EidosSessionState = {
  userId: string;
  currentWeek: number; // 0 = not yet begun, 1..3 = week
  currentModuleId: string | null;
  status: EidosSessionStatus;
  startedAt: string | null;
  lastActiveAt: string | null;
};

// ---------- chapters ----------

export type OperatingManualChapter = {
  userId: string;
  chapterNumber: 1 | 2 | 3;
  language: EidosLocale;
  body: string;
  inputs: Record<string, unknown>;
  model: string;
  tokensIn: number;
  tokensOut: number;
  generatedAt: string; // ISO
};
