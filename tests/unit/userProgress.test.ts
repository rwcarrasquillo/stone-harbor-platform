import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for lib/userProgress.ts.
 *
 * The progressive disclosure logic is the spine of the healing path
 * — if these computations regress, every gated feature is wrong.
 *
 * We mock `window` so the preview-override path can be exercised
 * from a Node environment. The real browser bahavior of localStorage
 * and URL parsing is identical to what we simulate here.
 */

import {
  FEATURE_THRESHOLDS,
  clearPreviewDay,
  daysSinceSignup,
  getPreviewDayOverride,
  isFeatureUnlocked,
  setPreviewDayOverride,
} from "@/lib/userProgress";

// ─── Mock window for preview-override tests ───────────────────────
// The userProgress module reads window.location.search and
// window.localStorage. In a Node test environment neither exists, so
// we stub both before each test.

type MockStore = Map<string, string>;

function mockWindow(opts: { search?: string; store?: MockStore } = {}) {
  const store: MockStore = opts.store ?? new Map();
  const win = {
    location: { search: opts.search ?? "" },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
  // @ts-expect-error — assigning a partial window mock is the point
  globalThis.window = win;
  return { win, store };
}

beforeEach(() => {
  // @ts-expect-error — start each test from a clean slate
  delete globalThis.window;
});

afterEach(() => {
  // @ts-expect-error — leave no global trail between tests
  delete globalThis.window;
});

// ─── FEATURE_THRESHOLDS ───────────────────────────────────────────

describe("FEATURE_THRESHOLDS", () => {
  it("maintains the expected milestone ordering", () => {
    // The disclosure timeline assumes these specific day values. If
    // any of them shift, the whole experience shifts — make a
    // failing test the first thing the developer sees.
    expect(FEATURE_THRESHOLDS.bodyCheck).toBe(30);
    expect(FEATURE_THRESHOLDS.longExhale).toBe(30);
    expect(FEATURE_THRESHOLDS.subMoods).toBe(60);
    expect(FEATURE_THRESHOLDS.smallThings).toBe(75);
    expect(FEATURE_THRESHOLDS.lineage).toBe(90);
    expect(FEATURE_THRESHOLDS.brotherhoodPairing).toBe(120);
  });

  it("orders thresholds monotonically (no out-of-order unlocks)", () => {
    const days = Object.values(FEATURE_THRESHOLDS);
    const sorted = [...days].sort((a, b) => a - b);
    expect(days).toEqual(sorted);
  });
});

// ─── daysSinceSignup ──────────────────────────────────────────────

describe("daysSinceSignup", () => {
  it("returns 0 for null or undefined createdAt with no override", () => {
    mockWindow();
    expect(daysSinceSignup(null)).toBe(0);
    expect(daysSinceSignup(undefined)).toBe(0);
  });

  it("returns 0 for an unparseable date", () => {
    mockWindow();
    expect(daysSinceSignup("not-a-date")).toBe(0);
  });

  it("returns 0 for a future date (negative difference clamped)", () => {
    mockWindow();
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSinceSignup(future)).toBe(0);
  });

  it("returns the floor of days between createdAt and now", () => {
    mockWindow();
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000 - 3600 * 1000, // 5d 1h
    ).toISOString();
    // 5 days and a bit floors to 5
    expect(daysSinceSignup(fiveDaysAgo)).toBe(5);
  });

  it("returns 0 for createdAt that's less than a full day old", () => {
    mockWindow();
    const fewHoursAgo = new Date(
      Date.now() - 3 * 3600 * 1000,
    ).toISOString();
    expect(daysSinceSignup(fewHoursAgo)).toBe(0);
  });
});

// ─── Preview override ─────────────────────────────────────────────

describe("preview override", () => {
  it("reads ?previewDay=N from the URL and returns it", () => {
    mockWindow({ search: "?previewDay=75" });
    expect(getPreviewDayOverride()).toBe(75);
  });

  it("persists URL override to localStorage as a side effect", () => {
    const { store } = mockWindow({ search: "?previewDay=60" });
    getPreviewDayOverride();
    expect(store.get("stone-harbor-preview-day")).toBe("60");
  });

  it("falls back to localStorage when the URL has no previewDay", () => {
    const { store } = mockWindow();
    store.set("stone-harbor-preview-day", "90");
    expect(getPreviewDayOverride()).toBe(90);
  });

  it("returns null when neither URL nor localStorage has a value", () => {
    mockWindow();
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("clears localStorage when URL is ?previewDay=clear", () => {
    const { store } = mockWindow({ search: "?previewDay=clear" });
    store.set("stone-harbor-preview-day", "30");
    expect(getPreviewDayOverride()).toBeNull();
    expect(store.has("stone-harbor-preview-day")).toBe(false);
  });

  it("clears localStorage when URL is ?previewDay= (empty)", () => {
    const { store } = mockWindow({ search: "?previewDay=" });
    store.set("stone-harbor-preview-day", "30");
    expect(getPreviewDayOverride()).toBeNull();
    expect(store.has("stone-harbor-preview-day")).toBe(false);
  });

  it("rejects negative previewDay values", () => {
    const { store } = mockWindow({ search: "?previewDay=-5" });
    store.set("stone-harbor-preview-day", "30");
    // Negative falls through to localStorage fallback
    expect(getPreviewDayOverride()).toBe(30);
  });

  it("rejects non-numeric previewDay values", () => {
    mockWindow({ search: "?previewDay=lots" });
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("setPreviewDayOverride writes to localStorage", () => {
    const { store } = mockWindow();
    setPreviewDayOverride(45);
    expect(store.get("stone-harbor-preview-day")).toBe("45");
  });

  it("setPreviewDayOverride(null) removes localStorage entry", () => {
    const { store } = mockWindow();
    store.set("stone-harbor-preview-day", "45");
    setPreviewDayOverride(null);
    expect(store.has("stone-harbor-preview-day")).toBe(false);
  });

  it("clearPreviewDay removes localStorage entry", () => {
    const { store } = mockWindow();
    store.set("stone-harbor-preview-day", "45");
    clearPreviewDay();
    expect(store.has("stone-harbor-preview-day")).toBe(false);
  });

  it("override takes precedence over createdAt in daysSinceSignup", () => {
    mockWindow({ search: "?previewDay=90" });
    const oldCreatedAt = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();
    // createdAt would yield 200, but override of 90 wins
    expect(daysSinceSignup(oldCreatedAt)).toBe(90);
  });

  it("returns null on server (no window)", () => {
    // No mockWindow call; window is undefined
    expect(getPreviewDayOverride()).toBeNull();
  });
});

// ─── isFeatureUnlocked ────────────────────────────────────────────

describe("isFeatureUnlocked", () => {
  it("returns false for newer-than-threshold accounts with no override", () => {
    mockWindow();
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isFeatureUnlocked(fiveDaysAgo, FEATURE_THRESHOLDS.bodyCheck)).toBe(
      false,
    );
  });

  it("returns true once the threshold is met", () => {
    mockWindow();
    const fortyDaysAgo = new Date(
      Date.now() - 40 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isFeatureUnlocked(fortyDaysAgo, FEATURE_THRESHOLDS.bodyCheck)).toBe(
      true,
    );
  });

  it("returns true at exactly the threshold day", () => {
    mockWindow();
    const exactlyThirty = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000 - 1000, // a touch past 30 days
    ).toISOString();
    expect(isFeatureUnlocked(exactlyThirty, FEATURE_THRESHOLDS.bodyCheck)).toBe(
      true,
    );
  });

  it("uses preview override when set", () => {
    mockWindow({ search: "?previewDay=120" });
    // createdAt = 5 days ago would normally fail every threshold
    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      isFeatureUnlocked(fiveDaysAgo, FEATURE_THRESHOLDS.brotherhoodPairing),
    ).toBe(true);
  });

  it("returns false when createdAt is null and there's no override", () => {
    mockWindow();
    expect(isFeatureUnlocked(null, FEATURE_THRESHOLDS.bodyCheck)).toBe(false);
  });

  it("respects override when createdAt is null", () => {
    mockWindow({ search: "?previewDay=30" });
    expect(isFeatureUnlocked(null, FEATURE_THRESHOLDS.bodyCheck)).toBe(true);
  });
});
