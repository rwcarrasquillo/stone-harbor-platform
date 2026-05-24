import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { shouldShowSmallThingToday } from "@/lib/smallThingCadence";

/**
 * Small-thing cadence tests. The cadence helper produces a
 * deterministic 3-of-7-days "show" pattern per user via a tiny
 * djb2 hash of (userId, YYYY-MM-DD).
 */
describe("shouldShowSmallThingToday", () => {
  beforeEach(() => {
    // Each test starts from a clean storage and clean URL.
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      window.history.replaceState({}, "", "/");
    }
  });

  afterEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
      window.history.replaceState({}, "", "/");
    }
  });

  it("returns false for empty userId", () => {
    expect(shouldShowSmallThingToday("")).toBe(false);
  });

  it("is deterministic for the same (userId, date) call", () => {
    const a = shouldShowSmallThingToday("user-deterministic-123");
    const b = shouldShowSmallThingToday("user-deterministic-123");
    expect(a).toBe(b);
  });

  it("produces different results for different users", () => {
    // Across many random ids at least some should land on different
    // slots. If every user got the same answer we'd have a bug.
    const results = new Set<boolean>();
    for (let i = 0; i < 100; i++) {
      results.add(shouldShowSmallThingToday(`user-variant-${i}`));
    }
    expect(results.size).toBe(2); // both true and false appear
  });

  it("yields roughly 3/7 true across a large population", () => {
    let trues = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (shouldShowSmallThingToday(`pop-user-${i}`)) trues++;
    }
    const ratio = trues / N;
    // 3/7 ≈ 0.428. Allow generous slack — this is a sanity check,
    // not a statistical proof.
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.55);
  });

  it("returns true on preview-mode override (via window stub)", () => {
    // Preview mode bypasses cadence so the founder can verify
    // the tile without waiting for a "yes" day.
    window.localStorage.setItem("stone-harbor-preview-day", "75");
    expect(shouldShowSmallThingToday("any-user")).toBe(true);
  });
});
