/**
 * scoreModule — dispatch a batch of responses to the correct
 * instrument's scorer and return the per-instrument result.
 *
 * Phase 1 supports four instruments: bfi10, schwartz, bpnsfs12,
 * phq2gad2. Adding a new instrument is a one-line addition to the
 * dispatch table here plus the implementation in instruments/.
 */

import { bfi10, type Bfi10Response } from "../instruments/bfi10";
import { schwartz, type SchwartzResponse } from "../instruments/schwartz";
import { bpnsfs12, type Bpnsfs12Response } from "../instruments/bpnsfs12";
import { phq2gad2, type Phq2Gad2Response } from "../instruments/phq2gad2";
import type { InstrumentId, InstrumentScoreResult } from "../types";

export function scoreModule(
  instrumentId: InstrumentId,
  responses: ReadonlyArray<{ itemId: string; value: unknown }>,
): InstrumentScoreResult {
  switch (instrumentId) {
    case "bfi10":
      return {
        instrumentId: "bfi10",
        scores: bfi10.score(responses as ReadonlyArray<Bfi10Response>),
      };
    case "schwartz":
      return {
        instrumentId: "schwartz",
        scores: schwartz.score(responses as ReadonlyArray<SchwartzResponse>),
      };
    case "bpnsfs12":
      return {
        instrumentId: "bpnsfs12",
        scores: bpnsfs12.score(responses as ReadonlyArray<Bpnsfs12Response>),
      };
    case "phq2gad2":
      return {
        instrumentId: "phq2gad2",
        scores: phq2gad2.score(responses as ReadonlyArray<Phq2Gad2Response>),
      };
    default: {
      // Exhaustiveness check — adding an InstrumentId without a case
      // here is a compile error.
      const _exhaustive: never = instrumentId;
      throw new Error(`Unknown instrument: ${_exhaustive}`);
    }
  }
}
