import { describe, it, expect } from "vitest";
import { MOODS } from "@/lib/moods";

/**
 * Moods taxonomy invariants. The dashboard, journal, and analytics
 * code assume MOODS has exactly six entries in a stable order.
 */
describe("MOODS", () => {
  it("has exactly six entries", () => {
    expect(MOODS.length).toBe(6);
  });

  it("contains the expected mood names", () => {
    expect(MOODS).toEqual([
      "grounded",
      "confused",
      "angry",
      "sad",
      "hopeful",
      "strong",
    ]);
  });

  it("has no duplicate moods", () => {
    expect(new Set(MOODS).size).toBe(MOODS.length);
  });
});
