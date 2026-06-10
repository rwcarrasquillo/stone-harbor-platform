import { describe, expect, it } from "vitest";

import {
  circularMeanHour,
  computeCircadian,
  computeConfidence,
  regularityEntropy,
  toLocal,
  type CircadianEvent,
  type CircadianInputs,
} from "./circadian";

/**
 * Unit tests for the circadian compute module. Pure math, no DB.
 *
 * Test cases follow the EID-20 acceptance list:
 *   - insufficient-data → zero (or low) confidence + null sub-measures
 *   - circular mean across midnight
 *   - evening-writer centroid
 *   - night-window load fraction
 *   - social jet lag (signed delta both directions, with wraparound)
 *
 * Plus the obvious unit cases for the small primitives so a regression
 * gets caught at the lowest level possible.
 */

const TZ = "America/New_York";

// Helper — build a synthetic event at a given UTC date+hour. We can't
// just say "12:00 in New York" without computing the UTC offset; the
// cleanest test inputs are UTC strings, and we let the toLocal()
// conversion be the thing under test for hour mapping.
function event(utc: string, id?: string): CircadianEvent {
  return { event_id: id ?? `evt_${utc}`, timestamp: utc };
}

function baseInputs(events: CircadianEvent[]): CircadianInputs {
  return {
    events,
    ianaTimezone: TZ,
    windowStart: new Date("2026-05-29T00:00:00Z"),
    windowEnd: new Date("2026-06-11T00:00:00Z"),
    minSampleSize: 5,
    minUniqueDays: 5,
    fullConfidenceSampleSize: 20,
    fullConfidenceWindowDays: 14,
  };
}

describe("toLocal — UTC → local conversion", () => {
  it("converts 14:00 UTC to 10:00 local in New York during EDT", () => {
    // 2026-06-01 is in Eastern Daylight Time, UTC-4.
    const r = toLocal("2026-06-01T14:00:00Z", TZ);
    expect(r.hour).toBe(10);
    expect(r.dayOfWeek).toBe(1); // Monday
    expect(r.calendarDayKey).toBe("2026-06-01");
  });

  it("handles midnight wrap — 03:30 UTC = 23:30 previous-day local", () => {
    const r = toLocal("2026-06-02T03:30:00Z", TZ);
    expect(r.hour).toBe(23);
    expect(r.calendarDayKey).toBe("2026-06-01"); // still Mon in local
  });

  it("returns ISO weekday — Saturday is 6, Sunday is 0", () => {
    expect(toLocal("2026-06-06T14:00:00Z", TZ).dayOfWeek).toBe(6); // Sat
    expect(toLocal("2026-06-07T14:00:00Z", TZ).dayOfWeek).toBe(0); // Sun
  });
});

describe("circularMeanHour — small fixed cases", () => {
  it("returns null on empty input", () => {
    expect(circularMeanHour([])).toBeNull();
  });

  it("averages 10:00 and 14:00 to ~12:00", () => {
    const m = circularMeanHour([10, 14])!;
    expect(m).toBeCloseTo(12, 5);
  });

  it("averages 23:00 and 01:00 to ~00:00, NOT 12:00", () => {
    // This is the entire reason we use circular mean: arithmetic mean
    // would give 12 (noon), which is the opposite side of the clock.
    const m = circularMeanHour([23, 1])!;
    // 0 or extremely close to it — the result wraps at 24, so allow
    // either 0 or ~24.
    expect(m < 0.01 || Math.abs(m - 24) < 0.01).toBe(true);
  });

  it("averages 22:00, 00:00, 02:00 to ~00:00", () => {
    const m = circularMeanHour([22, 0, 2])!;
    expect(m < 0.01 || Math.abs(m - 24) < 0.01).toBe(true);
  });
});

describe("regularityEntropy", () => {
  it("returns null on empty histogram or wrong length", () => {
    expect(regularityEntropy([])).toBeNull();
    expect(regularityEntropy([0, 0, 0])).toBeNull();
    expect(regularityEntropy(new Array(24).fill(0))).toBeNull();
  });

  it("returns 0 when all events fall on a single hour (perfectly regular)", () => {
    const histo = new Array(24).fill(0);
    histo[9] = 10;
    expect(regularityEntropy(histo)).toBeCloseTo(0, 6);
  });

  it("returns 1 when events are uniformly distributed across 24 hours", () => {
    const histo = new Array(24).fill(1);
    expect(regularityEntropy(histo)).toBeCloseTo(1, 6);
  });

  it("returns a value between 0 and 1 for an intermediate distribution", () => {
    const histo = new Array(24).fill(0);
    histo[9] = 5;
    histo[10] = 5;
    histo[22] = 1;
    const e = regularityEntropy(histo)!;
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(1);
  });
});

describe("computeConfidence", () => {
  it("returns 0 when sample is 0", () => {
    expect(computeConfidence(0, 0, 20, 14)).toBe(0);
  });

  it("returns 1 when both saturating thresholds are met", () => {
    expect(computeConfidence(20, 14, 20, 14)).toBe(1);
    expect(computeConfidence(100, 100, 20, 14)).toBe(1);
  });

  it("is bottle-necked by the smaller factor", () => {
    // 20/20 sample is fully saturated; but only 7/14 days = 0.5 day factor.
    // Product is 0.5.
    expect(computeConfidence(20, 7, 20, 14)).toBeCloseTo(0.5, 6);
  });

  it("scales linearly below saturation", () => {
    // 10/20 = 0.5 sample, 7/14 = 0.5 day → 0.25 confidence.
    expect(computeConfidence(10, 7, 20, 14)).toBeCloseTo(0.25, 6);
  });
});

describe("computeCircadian — insufficient data", () => {
  it("nulls sub-measures but still returns a (low) confidence when sample is below min", () => {
    // 3 events, 3 days → below both minimums (5/5)
    const r = computeCircadian(
      baseInputs([
        event("2026-06-01T14:00:00Z"),
        event("2026-06-02T15:00:00Z"),
        event("2026-06-03T16:00:00Z"),
      ]),
    );
    expect(r.sample_size).toBe(3);
    expect(r.unique_days).toBe(3);
    expect(r.centroid_hour).toBeNull();
    expect(r.regularity_entropy).toBeNull();
    expect(r.night_load_fraction).toBeNull();
    expect(r.social_jet_lag_hours).toBeNull();
    expect(r.confidence).toBeCloseTo((3 / 20) * (3 / 14), 6);
  });

  it("returns confidence 0 with zero events", () => {
    const r = computeCircadian(baseInputs([]));
    expect(r.sample_size).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.evidence.hour_histogram).toEqual(new Array(24).fill(0));
  });
});

describe("computeCircadian — evening writer centroid", () => {
  it("recognises an evening writer (~21:00 local)", () => {
    // Six events at 21:00 EDT (= 01:00 UTC next day) across six days
    const events = [
      event("2026-06-01T01:00:00Z"), // = 2026-05-31 21:00 EDT (Sun)
      event("2026-06-02T01:00:00Z"), // = 2026-06-01 21:00 EDT (Mon)
      event("2026-06-03T01:00:00Z"), // = 2026-06-02 21:00 EDT (Tue)
      event("2026-06-04T01:00:00Z"), // = 2026-06-03 21:00 EDT (Wed)
      event("2026-06-05T01:00:00Z"), // = 2026-06-04 21:00 EDT (Thu)
      event("2026-06-06T01:00:00Z"), // = 2026-06-05 21:00 EDT (Fri)
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.sample_size).toBe(6);
    expect(r.unique_days).toBe(6);
    expect(r.centroid_hour).toBeCloseTo(21, 5);
    // Six identical hours → entropy of 0
    expect(r.regularity_entropy).toBeCloseTo(0, 5);
    // 21:00 is outside the 23–04 night window → night load 0
    expect(r.night_load_fraction).toBe(0);
  });
});

describe("computeCircadian — circular centroid across midnight", () => {
  it("averages late-night and early-morning to a midnight-ish centroid", () => {
    // Three events at 23:00 EDT, three at 01:00 EDT. Arithmetic mean
    // would be 12 (noon, wrong). Circular mean should be ~00:00.
    const events = [
      event("2026-06-01T03:00:00Z"), // = 23:00 EDT 5/31 (Sun)
      event("2026-06-02T03:00:00Z"), // = 23:00 EDT 6/1 (Mon)
      event("2026-06-03T03:00:00Z"), // = 23:00 EDT 6/2 (Tue)
      event("2026-06-04T05:00:00Z"), // = 01:00 EDT 6/4 (Thu)
      event("2026-06-05T05:00:00Z"), // = 01:00 EDT 6/5 (Fri)
      event("2026-06-06T05:00:00Z"), // = 01:00 EDT 6/6 (Sat)
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.centroid_hour).not.toBeNull();
    // Should be ~24 (which is 0) — allow either close to 0 or close to 24
    const h = r.centroid_hour!;
    expect(h < 0.5 || Math.abs(h - 24) < 0.5).toBe(true);
    // All six events fall in the night window (23–04)
    expect(r.night_load_fraction).toBeCloseTo(1, 5);
  });
});

describe("computeCircadian — night-window load", () => {
  it("computes the correct fraction for a mix of night and day events", () => {
    // 3 night (23:00 EDT) + 3 day (14:00 EDT) → night fraction = 0.5
    const events = [
      event("2026-06-01T03:00:00Z"), // night
      event("2026-06-02T03:00:00Z"), // night
      event("2026-06-03T03:00:00Z"), // night
      event("2026-06-04T18:00:00Z"), // day (14:00 EDT)
      event("2026-06-05T18:00:00Z"), // day
      event("2026-06-06T18:00:00Z"), // day
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.night_load_fraction).toBeCloseTo(0.5, 5);
  });

  it("treats 04:00 local as NOT night (boundary)", () => {
    // 04:00 EDT = 08:00 UTC. Window is 23 ≤ h < 24 OR 0 ≤ h < 4.
    const events = [
      event("2026-06-01T08:00:00Z"), // 04:00 EDT
      event("2026-06-02T08:00:00Z"),
      event("2026-06-03T08:00:00Z"),
      event("2026-06-04T08:00:00Z"),
      event("2026-06-05T08:00:00Z"),
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.night_load_fraction).toBe(0);
  });
});

describe("computeCircadian — social jet lag", () => {
  it("computes positive delta when weekend mean is later than weekday mean", () => {
    // Weekday writes at 10:00 EDT (= 14:00 UTC)
    // Weekend writes at 14:00 EDT (= 18:00 UTC)
    // Expected: weekend - weekday ≈ +4
    const events = [
      // Weekdays: Mon-Fri 6/1-6/5
      event("2026-06-01T14:00:00Z"), // Mon
      event("2026-06-02T14:00:00Z"), // Tue
      event("2026-06-03T14:00:00Z"), // Wed
      event("2026-06-04T14:00:00Z"), // Thu
      event("2026-06-05T14:00:00Z"), // Fri
      // Weekend: Sat 6/6, Sun 6/7
      event("2026-06-06T18:00:00Z"), // Sat
      event("2026-06-07T18:00:00Z"), // Sun
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.social_jet_lag_hours).not.toBeNull();
    expect(r.social_jet_lag_hours!).toBeCloseTo(4, 5);
  });

  it("computes negative delta when weekday mean is later than weekend mean", () => {
    // Weekday late nights (work-imposed), weekend mid-day
    const events = [
      event("2026-06-02T02:00:00Z"), // = Mon 22:00 EDT
      event("2026-06-03T02:00:00Z"), // = Tue 22:00 EDT
      event("2026-06-04T02:00:00Z"), // = Wed 22:00 EDT
      event("2026-06-05T02:00:00Z"), // = Thu 22:00 EDT
      event("2026-06-06T02:00:00Z"), // = Fri 22:00 EDT
      event("2026-06-06T18:00:00Z"), // Sat 14:00 EDT
      event("2026-06-07T18:00:00Z"), // Sun 14:00 EDT
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.social_jet_lag_hours).not.toBeNull();
    // weekend (14) - weekday (22) on circular clock = -8
    expect(r.social_jet_lag_hours!).toBeCloseTo(-8, 5);
  });

  it("returns null when one bucket has zero events", () => {
    // All weekdays — no weekend data
    const events = [
      event("2026-06-01T14:00:00Z"),
      event("2026-06-02T14:00:00Z"),
      event("2026-06-03T14:00:00Z"),
      event("2026-06-04T14:00:00Z"),
      event("2026-06-05T14:00:00Z"),
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.social_jet_lag_hours).toBeNull();
  });
});

describe("computeCircadian — evidence pointer", () => {
  it("includes the event ids and the 24-bin hour histogram", () => {
    const events = [
      event("2026-06-01T14:00:00Z", "evt_a"), // 10:00 EDT
      event("2026-06-02T14:00:00Z", "evt_b"), // 10:00 EDT
      event("2026-06-03T18:00:00Z", "evt_c"), // 14:00 EDT
      event("2026-06-04T18:00:00Z", "evt_d"), // 14:00 EDT
      event("2026-06-05T18:00:00Z", "evt_e"), // 14:00 EDT
    ];
    const r = computeCircadian(baseInputs(events));
    expect(r.evidence.event_ids).toEqual([
      "evt_a",
      "evt_b",
      "evt_c",
      "evt_d",
      "evt_e",
    ]);
    expect(r.evidence.hour_histogram[10]).toBe(2);
    expect(r.evidence.hour_histogram[14]).toBe(3);
    expect(
      r.evidence.hour_histogram.reduce((a, b) => a + b, 0),
    ).toBe(5);
    expect(r.evidence.weekday_count + r.evidence.weekend_count).toBe(5);
  });
});
