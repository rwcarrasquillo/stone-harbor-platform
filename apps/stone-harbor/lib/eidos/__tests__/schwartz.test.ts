/**
 * Schwartz Values unit tests.
 *
 * The short PVQ-10 form is the simplest of the Phase 1 instruments —
 * one item per value, no reverse-scoring, no subscale averaging.
 * Tests cover completeness, the rank() ordering helper, and the
 * round-trip for a deliberately skewed response set.
 */

import { describe, it, expect } from "vitest";
import { schwartz } from "../instruments/schwartz";

describe("schwartz scoring", () => {
  it("returns the raw value per subscale when all items are answered", () => {
    const responses = schwartz.items.map((it, i) => ({
      itemId: it.id,
      // Cycle 1..6 so each subscale lands on a known value.
      value: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    }));
    const scores = schwartz.score(responses);
    // First item (sv1, selfDirection) is index 0 → value 1.
    expect(scores.selfDirection).toBe(1);
    // Index 5 (sv6, security) → value 6.
    expect(scores.security).toBe(6);
  });

  it("throws when an item is missing", () => {
    const partial = schwartz.items.slice(0, 5).map((it) => ({
      itemId: it.id,
      value: 4 as const,
    }));
    expect(() => schwartz.score(partial)).toThrow(/incomplete/i);
  });

  it("rank() returns dimensions ordered from highest to lowest", () => {
    const responses = schwartz.items.map((it, i) => ({
      itemId: it.id,
      value: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
    }));
    const scores = schwartz.score(responses);
    const ranked = schwartz.rank(scores);
    // The first ranked dimension should have the highest score.
    expect(scores[ranked[0]]).toBeGreaterThanOrEqual(scores[ranked[1]]);
    expect(scores[ranked[1]]).toBeGreaterThanOrEqual(scores[ranked[2]]);
    expect(ranked.length).toBe(10);
  });

  it("rank() puts benevolence first when benevolence is maxed", () => {
    const responses = schwartz.items.map((it) => ({
      itemId: it.id,
      value: 1 as const,
    }));
    // Override benevolence (sv9) to 6.
    const benevIdx = schwartz.items.findIndex((it) => it.subscale === "benevolence");
    responses[benevIdx] = { ...responses[benevIdx], value: 6 as never };
    const scores = schwartz.score(responses);
    const ranked = schwartz.rank(scores);
    expect(ranked[0]).toBe("benevolence");
  });
});
