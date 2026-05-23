import { describe, expect, it } from "vitest";
import { MOODS } from "@/lib/moods";

/**
 * Unit tests for lib/moods.ts.
 *
 * Tiny module, tiny tests — but if the mood taxonomy ever drifts
 * from the journal UI or the database, things break in confusing
 * ways. These tests pin the shape.
 */

describe("MOODS", () => {
  it("has exactly six entries", () => {
    expect(MOODS).toHaveLength(6);
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
