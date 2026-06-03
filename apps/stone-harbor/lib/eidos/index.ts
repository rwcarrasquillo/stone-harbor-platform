/**
 * Eidos — public API surface.
 *
 * This is the contract a consumer (today: Stone Harbor; later: any
 * second product that adopts the engine) relies on. Anything not
 * exported here is internal — refactor freely, but treat exports as
 * stable.
 *
 * If you need to add a new public function, put it here AND document
 * it in lib/eidos/README.md.
 */

// Types are the most-imported surface; export the whole module.
export type {
  EidosLocale,
  EidosLayer,
  EidosSessionStatus,
  EidosSessionState,
  InstrumentId,
  InstrumentResponse,
  InstrumentScoreResult,
  Bfi10Scores,
  SchwartzScores,
  BpnsfsScores,
  Phq2Gad2Scores,
  LayerScoreRow,
  PillarRecommendation,
  CrisisLevel,
  SafetyAssessment,
  OperatingManualChapter,
} from "./types";

// Scoring — per-instrument and aggregate.
export { scoreModule } from "./scoring/score-module";
export { aggregateLayers } from "./scoring/aggregate-layers";

// Pillar recommendation (Phase 1, trait + values + motivation based).
export { recommendPillar } from "./scoring/recommend-pillar";

// Safety evaluation — every response set passes through this.
export { evaluateSafety } from "./safety/evaluate";

// Session state machine.
export {
  initSession,
  advanceModule,
  pauseSession,
  resumeSession,
} from "./session/state-machine";

// Operating Manual chapter generators.
export { generateChapter1 } from "./chapters/chapter1";

// Instrument definitions (items + scoring) — exported so the consumer
// can render the questions in its own UI.
export { bfi10 } from "./instruments/bfi10";
export { schwartz } from "./instruments/schwartz";
export { bpnsfs12 } from "./instruments/bpnsfs12";
export { phq2gad2 } from "./instruments/phq2gad2";
