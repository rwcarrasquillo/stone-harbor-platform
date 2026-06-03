/**
 * BFI-10 unit tests.
 *
 * These run against the engine's public scoring function and cover
 * the cases that have caused regressions in similar instruments
 * elsewhere: reverse-scoring direction, partial-response detection,
 * and the round-trip from raw responses to subscale means.
 */

import { describe, it, expect } from "vitest";
import { bfi10 } from "../instruments/bfi10";

/** Convenience: build a complete BFI-10 response set with a fixed value. */
function uniform(value: 1 | 2 | 3 | 4 | 5) {
  return bfi10.items.map((it) => ({ itemId: it.id, value }));
}

describe("bfi10 scoring", () => {
  it("returns midpoint scores when every item is answered '3'", () => {
    const scores = bfi10.score(uniform(3));
    // After reverse-scoring, 3 stays 3 (6 - 3 = 3). All averages are 3.
    expect(scores.openness).toBe(3);
    expect(scores.conscientiousness).toBe(3);
    expect(scores.extraversion).toBe(3);
    expect(scores.agreeableness).toBe(3);
    expect(scores.neuroticism).toBe(3);
  });

  it("correctly reverses items flagged as reverse-scored", () => {
    // All "5" responses. Direct items contribute 5; reverse items
    // contribute 6 - 5 = 1. Each subscale averages one direct +
    // one reverse, so means = (5 + 1) / 2 = 3.
    const scores = bfi10.score(uniform(5));
    expect(scores.openness).toBe(3);
    expect(scores.conscientiousness).toBe(3);
    expect(scores.extraversion).toBe(3);
    expect(scores.agreeableness).toBe(3);
    expect(scores.neuroticism).toBe(3);
  });

  it("throws when an item is missing", () => {
    const partial = bfi10.items.slice(0, 9).map((it) => ({
      itemId: it.id,
      value: 3 as const,
    }));
    expect(() => bfi10.score(partial)).toThrow(/incomplete/i);
  });

  it("describes subscale scores in three qualitative bands", () => {
    expect(bfi10.describe("neuroticism", 1.5)).toBe("low");
    expect(bfi10.describe("neuroticism", 3.0)).toBe("mid");
    expect(bfi10.describe("neuroticism", 4.5)).toBe("high");
  });
});
