import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  FEATURE_THRESHOLDS,
  daysSinceSignup,
  getPreviewDayOverride,
  setPreviewDayOverride,
  clearPreviewDay,
  isFeatureUnlocked,
} from "@/lib/userProgress";

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

function clearStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
}

describe("FEATURE_THRESHOLDS", () => {
  it("maintains the expected milestone ordering", () => {
    // Body/longExhale at 30, subMoods at 60, smallThings at 75,
    // lineage at 90, brotherhoodPairing at 120 — established
    // by the healing-path design.
    expect(FEATURE_THRESHOLDS.bodyCheck).toBe(30);
    expect(FEATURE_THRESHOLDS.longExhale).toBe(30);
    expect(FEATURE_THRESHOLDS.subMoods).toBe(60);
    expect(FEATURE_THRESHOLDS.smallThings).toBe(75);
    expect(FEATURE_THRESHOLDS.lineage).toBe(90);
    expect(FEATURE_THRESHOLDS.brotherhoodPairing).toBe(120);
  });

  it("orders thresholds monotonically (no out-of-order unlocks)", () => {
    const ordered = [
      FEATURE_THRESHOLDS.bodyCheck,
      FEATURE_THRESHOLDS.subMoods,
      FEATURE_THRESHOLDS.smallThings,
      FEATURE_THRESHOLDS.lineage,
      FEATURE_THRESHOLDS.brotherhoodPairing,
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThanOrEqual(ordered[i - 1]);
    }
  });
});

describe("daysSinceSignup", () => {
  beforeEach(clearStorage);
  afterEach(clearStorage);

  it("returns 0 for null or undefined createdAt with no override", () => {
    expect(daysSinceSignup(null)).toBe(0);
    expect(daysSinceSignup(undefined)).toBe(0);
  });

  it("returns 0 for an unparseable date", () => {
    expect(daysSinceSignup("not-a-date")).toBe(0);
  });

  it("returns 0 for a future date (negative difference clamped)", () => {
    const future = new Date(Date.now() + 5 * ONE_DAY_MS).toISOString();
    expect(daysSinceSignup(future)).toBe(0);
  });

  it("returns the floor of days between createdAt and now", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * ONE_DAY_MS).toISOString();
    expect(daysSinceSignup(tenDaysAgo)).toBe(10);
  });

  it("returns 0 for createdAt that's less than a full day old", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(daysSinceSignup(oneHourAgo)).toBe(0);
  });
});

describe("preview override", () => {
  beforeEach(clearStorage);
  afterEach(clearStorage);

  it("reads ?previewDay=N from the URL and returns it", () => {
    window.history.replaceState({}, "", "/?previewDay=60");
    expect(getPreviewDayOverride()).toBe(60);
  });

  it("persists URL override to localStorage as a side effect", () => {
    window.history.replaceState({}, "", "/?previewDay=42");
    getPreviewDayOverride();
    expect(window.localStorage.getItem("stone-harbor-preview-day")).toBe("42");
  });

  it("falls back to localStorage when the URL has no previewDay", () => {
    window.localStorage.setItem("stone-harbor-preview-day", "30");
    expect(getPreviewDayOverride()).toBe(30);
  });

  it("returns null when neither URL nor localStorage has a value", () => {
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("clears localStorage when URL is ?previewDay=clear", () => {
    window.localStorage.setItem("stone-harbor-preview-day", "30");
    window.history.replaceState({}, "", "/?previewDay=clear");
    expect(getPreviewDayOverride()).toBeNull();
    expect(window.localStorage.getItem("stone-harbor-preview-day")).toBeNull();
  });

  it("clears localStorage when URL is ?previewDay= (empty)", () => {
    window.localStorage.setItem("stone-harbor-preview-day", "30");
    window.history.replaceState({}, "", "/?previewDay=");
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("rejects negative previewDay values", () => {
    window.history.replaceState({}, "", "/?previewDay=-5");
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("rejects non-numeric previewDay values", () => {
    window.history.replaceState({}, "", "/?previewDay=banana");
    expect(getPreviewDayOverride()).toBeNull();
  });

  it("setPreviewDayOverride writes to localStorage", () => {
    setPreviewDayOverride(90);
    expect(window.localStorage.getItem("stone-harbor-preview-day")).toBe("90");
  });

  it("setPreviewDayOverride(null) removes localStorage entry", () => {
    window.localStorage.setItem("stone-harbor-preview-day", "75");
    setPreviewDayOverride(null);
    expect(window.localStorage.getItem("stone-harbor-preview-day")).toBeNull();
  });

  it("clearPreviewDay removes localStorage entry", () => {
    window.localStorage.setItem("stone-harbor-preview-day", "75");
    clearPreviewDay();
    expect(window.localStorage.getItem("stone-harbor-preview-day")).toBeNull();
  });

  it("override takes precedence over createdAt in daysSinceSignup", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * ONE_DAY_MS).toISOString();
    window.history.replaceState({}, "", "/?previewDay=90");
    expect(daysSinceSignup(fiveDaysAgo)).toBe(90);
  });

  it("returns null on server (no window)", () => {
    // Vitest with happy-dom always has window, so we simulate by
    // stashing then restoring. The branch we exercise is the
    // typeof-window guard.
    const stash = globalThis.window;
    // @ts-expect-error — intentionally deleting for SSR sim
    delete globalThis.window;
    try {
      expect(getPreviewDayOverride()).toBeNull();
    } finally {
      globalThis.window = stash;
    }
  });
});

describe("isFeatureUnlocked", () => {
  beforeEach(clearStorage);
  afterEach(clearStorage);

  it("returns false for newer-than-threshold accounts with no override", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * ONE_DAY_MS).toISOString();
    expect(isFeatureUnlocked(tenDaysAgo, FEATURE_THRESHOLDS.bodyCheck)).toBe(
      false,
    );
  });

  it("returns true once the threshold is met", () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * ONE_DAY_MS).toISOString();
    expect(isFeatureUnlocked(fortyDaysAgo, FEATURE_THRESHOLDS.bodyCheck)).toBe(
      true,
    );
  });

  it("returns true at exactly the threshold day", () => {
    const exactlyAtThreshold = new Date(
      Date.now() - 30 * ONE_DAY_MS - 1000, // a hair past 30d
    ).toISOString();
    expect(
      isFeatureUnlocked(exactlyAtThreshold, FEATURE_THRESHOLDS.bodyCheck),
    ).toBe(true);
  });

  it("uses preview override when set", () => {
    window.history.replaceState({}, "", "/?previewDay=120");
    expect(
      isFeatureUnlocked(null, FEATURE_THRESHOLDS.brotherhoodPairing),
    ).toBe(true);
  });

  it("returns false when createdAt is null and there's no override", () => {
    expect(isFeatureUnlocked(null, FEATURE_THRESHOLDS.bodyCheck)).toBe(false);
  });

  it("respects override when createdAt is null", () => {
    window.history.replaceState({}, "", "/?previewDay=30");
    expect(isFeatureUnlocked(null, FEATURE_THRESHOLDS.bodyCheck)).toBe(true);
  });
});
