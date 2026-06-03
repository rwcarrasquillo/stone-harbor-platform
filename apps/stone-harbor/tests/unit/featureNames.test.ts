import { describe, it, expect } from "vitest";
import { featureForPath, SLUG_TO_FEATURE } from "@/lib/featureNames";

/**
 * Tests for the slug → brand-name mapping. This is what shows
 * up in the analytics dashboard's "Top member pages" table, so
 * regressions here mean the team starts seeing raw URL slugs
 * instead of the brand language. Worth pinning.
 */
describe("featureForPath — known doors", () => {
  it("maps /journal to Reflect", () => {
    expect(featureForPath("/journal")).toBe("Reflect");
  });

  it("maps /vent to Vent", () => {
    expect(featureForPath("/vent")).toBe("Vent");
  });

  it("maps /messages to Brotherhood", () => {
    expect(featureForPath("/messages")).toBe("Brotherhood");
  });

  it("maps /meditation to Breathe", () => {
    expect(featureForPath("/meditation")).toBe("Breathe");
  });

  it("maps /members-blog to Members Blog", () => {
    expect(featureForPath("/members-blog")).toBe("Members Blog");
  });
});

describe("featureForPath — root and unmapped routes", () => {
  it("maps / (empty) to Home", () => {
    expect(featureForPath("/")).toBe("Home");
  });

  it("maps empty string to Home", () => {
    expect(featureForPath("")).toBe("Home");
  });

  it("title-cases an unmapped single-word slug", () => {
    expect(featureForPath("/unknown")).toBe("Unknown");
  });

  it("title-cases an unmapped hyphenated slug", () => {
    expect(featureForPath("/some-new-page")).toBe("Some New Page");
  });

  it("is case-insensitive on the slug lookup", () => {
    expect(featureForPath("/JOURNAL")).toBe("Reflect");
    expect(featureForPath("/Journal")).toBe("Reflect");
  });
});

describe("featureForPath — sub-paths and query strings", () => {
  it("buckets nested routes by their first segment", () => {
    expect(featureForPath("/journal/123")).toBe("Reflect");
    expect(featureForPath("/messages/abc/replies")).toBe("Brotherhood");
  });

  it("ignores leading slashes (multi-slash defensive)", () => {
    expect(featureForPath("///journal")).toBe("Reflect");
  });
});

describe("SLUG_TO_FEATURE map", () => {
  it("includes all four named dashboard doors", () => {
    expect(SLUG_TO_FEATURE.journal).toBe("Reflect");
    expect(SLUG_TO_FEATURE.vent).toBe("Vent");
    expect(SLUG_TO_FEATURE.messages).toBe("Brotherhood");
    expect(SLUG_TO_FEATURE.meditation).toBe("Breathe");
  });

  it("contains no empty-string values (would render as blank rows)", () => {
    for (const [, label] of Object.entries(SLUG_TO_FEATURE)) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });
});
