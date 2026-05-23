import { describe, expect, it } from "vitest";
import { shouldShowSmallThingToday } from "@/lib/smallThingCadence";

/**
 * Unit tests for the small-thing cadence.
 *
 * shouldShowSmallThingToday is deterministic given (userId, today).
 * Three properties matter:
 *   1. For any given (userId, date), the answer is stable — refreshing
 *      the dashboard doesn't make the tile appear and disappear.
 *   2. Across many users + many days, the rate of "yes" is roughly
 *      3/7 (about 43%). We don't need statistical perfection; we need
 *      a reasonable distribution.
 *   3. No two consecutive days produce "yes" for the same user.
 *
 * The function reads window.location.search at runtime to honor
 * preview-mode bypass; for cadence-correctness testing we leave
 * window undefined (Node test env) so the override path is skipped.
 */

describe("shouldShowSmallThingToday", () => {
  it("returns false for empty userId", () => {
    expect(shouldShowSmallThingToday("")).toBe(false);
  });

  it("is deterministic for the same (userId, date) call", () => {
    const userId = "abc-123-def-456";
    const a = shouldShowSmallThingToday(userId);
    const b = shouldShowSmallThingToday(userId);
    const c = shouldShowSmallThingToday(userId);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("produces different results for different users", () => {
    // With 1000 different user IDs, at least some should be true and
    // some should be false today.
    const results = new Set<boolean>();
    for (let i = 0; i < 1000; i++) {
      results.add(shouldShowSmallThingToday(`user-${i}-test`));
    }
    expect(results.has(true)).toBe(true);
    expect(results.has(false)).toBe(true);
  });

  it("yields roughly 3/7 true across a large population", () => {
    // The function maps each (user, day) to a slot 0..6 and shows on
    // slots {1, 3, 5} — exactly 3 of 7 = ~42.9%. With 10,000 users
    // we'd expect ~4,290 true. Allow ±10% wiggle room.
    let trueCount = 0;
    const total = 10_000;
    for (let i = 0; i < total; i++) {
      if (shouldShowSmallThingToday(`user-${i}-test`)) trueCount++;
    }
    const ratio = trueCount / total;
    // Expected: 0.429. Allowing 0.36..0.50 keeps the test stable
    // across days without making it useless.
    expect(ratio).toBeGreaterThan(0.36);
    expect(ratio).toBeLessThan(0.5);
  });

  it("returns true on preview-mode override (via window stub)", () => {
    // Simulate preview-active by stubbing window with a previewDay
    // search param. The function should short-circuit to true. We
    // cast through unknown to bypass the strict Window/Storage
    // shape; this is a stub for a single function read.
    const userId = "any-user";
    const original = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      location: { search: "?previewDay=75" },
      localStorage: {
        getItem: () => "75",
        setItem: () => {},
        removeItem: () => {},
      },
    };
    try {
      expect(shouldShowSmallThingToday(userId)).toBe(true);
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });
});
