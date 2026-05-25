/**
 * Session state machine — Phase 1.
 *
 * Pure functions over EidosSessionState. The consumer (the API route
 * handler that backs /map/*) calls these to compute the next state
 * after a user action, then writes the result back to eidos_sessions.
 *
 * Keeping these as pure functions means: easy to unit-test, no
 * coupling to Supabase, no I/O. The persistence layer is the
 * consumer's problem; the rules are Eidos's.
 *
 * Phase 1 weeks:
 *   week 0 — not yet begun
 *   week 1 — Foundation (Modules 1.1, 1.2, 1.3, 1.4)
 *   week 2 — Patterns       ← Phase 2 (deferred)
 *   week 3 — Depth          ← Phase 2 (deferred)
 *
 * Phase 1 modules:
 *   "1.1" — baseline (PHQ-2 + GAD-2)
 *   "1.2" — traits (BFI-10)
 *   "1.3" — values (Schwartz)
 *   "1.4" — motivation (BPNSFS-12)
 */

import type { EidosSessionState } from "../types";

const PHASE_1_MODULE_ORDER = ["1.1", "1.2", "1.3", "1.4"] as const;

export function initSession(userId: string): EidosSessionState {
  return {
    userId,
    currentWeek: 1,
    currentModuleId: "1.1",
    status: "in_progress",
    startedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };
}

export function advanceModule(state: EidosSessionState): EidosSessionState {
  if (state.status === "complete") return state;

  const i = state.currentModuleId
    ? PHASE_1_MODULE_ORDER.indexOf(
        state.currentModuleId as (typeof PHASE_1_MODULE_ORDER)[number],
      )
    : -1;

  // Reached the end of Phase 1's available modules — mark complete.
  // (Weeks 2 and 3 don't exist in Phase 1; the consumer's UI shows
  // "more coming" rather than navigating into them.)
  if (i < 0 || i >= PHASE_1_MODULE_ORDER.length - 1) {
    return {
      ...state,
      currentModuleId: null,
      status: "complete",
      lastActiveAt: new Date().toISOString(),
    };
  }

  return {
    ...state,
    currentModuleId: PHASE_1_MODULE_ORDER[i + 1],
    status: "in_progress",
    lastActiveAt: new Date().toISOString(),
  };
}

export function pauseSession(state: EidosSessionState): EidosSessionState {
  if (state.status === "complete") return state;
  return {
    ...state,
    status: "paused",
    lastActiveAt: new Date().toISOString(),
  };
}

export function resumeSession(state: EidosSessionState): EidosSessionState {
  if (state.status !== "paused") return state;
  return {
    ...state,
    status: "in_progress",
    lastActiveAt: new Date().toISOString(),
  };
}
