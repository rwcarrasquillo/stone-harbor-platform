/**
 * Safety evaluator tests (SH-150, audit blocker 4).
 *
 * PHQ-2 / GAD-2 are screeners, not crisis detectors: a positive screen
 * may only ever produce the neutral `followUpSuggested` signal, never a
 * crisis level, a resource prompt, or a progression block.
 */

import { describe, it, expect } from "vitest";
import { evaluateSafety } from "../safety/evaluate";
import type { InstrumentResponse } from "../types";

function screen(phq1: number | null, phq2: number | null, gad1: number | null, gad2: number | null) {
  return ([
    ["phq1", phq1],
    ["phq2", phq2],
    ["gad1", gad1],
    ["gad2", gad2],
  ] as const).map(
    ([itemId, value]): InstrumentResponse => ({ instrumentId: "phq2gad2", itemId, value }),
  );
}

describe("evaluateSafety", () => {
  it("reports nothing when there is no screen", () => {
    const r = evaluateSafety([]);
    expect(r).toEqual({
      level: "none",
      signals: [],
      followUpSuggested: false,
      recommendsResource: false,
      blockProgression: false,
    });
  });

  it("reports nothing below the screening cutoff", () => {
    const r = evaluateSafety(screen(1, 1, 1, 0));
    expect(r.followUpSuggested).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it("suggests follow-up on a positive PHQ-2 without raising a crisis level", () => {
    const r = evaluateSafety(screen(2, 1, 0, 0));
    expect(r.followUpSuggested).toBe(true);
    expect(r.signals).toEqual(["phq2.positive_screen"]);
    expect(r.level).toBe("none");
    expect(r.recommendsResource).toBe(false);
    expect(r.blockProgression).toBe(false);
  });

  it("never escalates, even at maximum scores on both screens", () => {
    const r = evaluateSafety(screen(3, 3, 3, 3));
    expect(r.level).toBe("none");
    expect(r.followUpSuggested).toBe(true);
    expect(r.signals).toEqual(["phq2.positive_screen", "gad2.positive_screen"]);
  });

  it("treats a fully skipped screen as no signal", () => {
    const r = evaluateSafety(screen(null, null, null, null));
    expect(r.followUpSuggested).toBe(false);
  });
});
