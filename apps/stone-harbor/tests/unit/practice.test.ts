import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRACTICE_ABSENCE_THRESHOLD_DAYS,
  getPresenceForRange,
  getReturnCardEligibility,
  getTimeOfDayBlock,
  stampReturnCardShown,
} from "@/lib/practice";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stone Harbor — /practice helper tests (SH-135).
 *
 * Pure logic + the query-shaped helpers. Components are deliberately
 * out of the unit suite (see vitest.config.ts); the cards are covered
 * by eye on the preview and by Playwright later.
 *
 * NOTE ON LOCATION: this file lives in tests/unit/ rather than
 * lib/__tests__/ because vitest.config.ts includes ONLY
 * "tests/unit/**\/*.test.ts". A suite under lib/__tests__/ is never
 * collected — which is exactly why lib/story/__tests__/surfacer.test.ts
 * has never run.
 */

// ---------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------

/**
 * Minimal Supabase double. `maybeSingle` resolves the row handed in;
 * the journal path resolves the array handed in. Only the call shapes
 * lib/practice.ts actually uses are modelled.
 */
function fakeClient(opts: {
  profileRow?: Record<string, unknown> | null;
  journalRows?: Array<{ created_at: string | null }>;
  updateError?: { message: string } | null;
  throwOn?: "select" | "update";
}): SupabaseClient {
  const updateCalls: Array<Record<string, unknown>> = [];

  const client = {
    updateCalls,
    from(table: string) {
      if (opts.throwOn === "select") {
        throw new Error("boom");
      }
      return {
        select() {
          return {
            eq() {
              return {
                // profiles path
                maybeSingle: async () => ({ data: opts.profileRow ?? null }),
                // journal_entries path
                gte: async () => ({ data: opts.journalRows ?? [] }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          if (opts.throwOn === "update") throw new Error("boom");
          updateCalls.push({ table, ...patch });
          return {
            eq: async () => ({ error: opts.updateError ?? null }),
          };
        },
      };
    },
  };

  return client as unknown as SupabaseClient;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------
// getTimeOfDayBlock
// ---------------------------------------------------------------------

describe("getTimeOfDayBlock", () => {
  // Constructed without a Z suffix so they are local-time, which is
  // what the function reads (getHours, not getUTCHours).
  it.each([
    ["2026-09-01T00:00:00", "morning_anchor"],
    ["2026-09-01T11:59:59", "morning_anchor"],
    ["2026-09-01T12:00:00", "midday_touch"],
    ["2026-09-01T17:59:59", "midday_touch"],
    ["2026-09-01T18:00:00", "evening_close"],
    ["2026-09-01T23:59:59", "evening_close"],
  ])("%s → %s", (input, expected) => {
    expect(getTimeOfDayBlock(new Date(input))).toBe(expected);
  });

  it("puts the band boundaries at noon and 18:00 exactly", () => {
    expect(getTimeOfDayBlock(new Date("2026-09-01T11:59:59"))).not.toBe(
      getTimeOfDayBlock(new Date("2026-09-01T12:00:00")),
    );
    expect(getTimeOfDayBlock(new Date("2026-09-01T17:59:59"))).not.toBe(
      getTimeOfDayBlock(new Date("2026-09-01T18:00:00")),
    );
  });
});

// ---------------------------------------------------------------------
// getReturnCardEligibility
// ---------------------------------------------------------------------

describe("getReturnCardEligibility", () => {
  const shape = {
    morning_anchor: "walking",
    midday_touch: "",
    evening_close: "",
    declared_at: "2026-08-01T09:00:00Z",
    last_reshape_at: "2026-08-01T09:00:00Z",
  };

  it("is eligible when a shape exists, he's been away 5+ days, and it hasn't shown today", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(6),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(true);
    expect(result.hasDeclaredShape).toBe(true);
    expect(result.daysSinceLastSeen).toBe(6);
    expect(result.alreadyShownWithin24hr).toBe(false);
  });

  it("is not eligible without a declared shape, however long he's been away", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: null,
          last_seen_at: isoDaysAgo(30),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.hasDeclaredShape).toBe(false);
  });

  it("treats an all-blank shape as no shape", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: { ...shape, morning_anchor: "   " },
          last_seen_at: isoDaysAgo(9),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.hasDeclaredShape).toBe(false);
  });

  it("is not eligible when he hasn't actually been away", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(1),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.daysSinceLastSeen).toBe(1);
  });

  it("holds the threshold at exactly 5 days", async () => {
    const at = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(PRACTICE_ABSENCE_THRESHOLD_DAYS),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    const justUnder = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(PRACTICE_ABSENCE_THRESHOLD_DAYS - 1),
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(at.eligible).toBe(true);
    expect(justUnder.eligible).toBe(false);
  });

  it("is not eligible when it already showed inside the 24hr window", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(10),
          return_card_last_shown_at: new Date(Date.now() - 3600_000).toISOString(),
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(false);
    expect(result.alreadyShownWithin24hr).toBe(true);
  });

  it("is eligible again once the 24hr window has passed", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: isoDaysAgo(10),
          return_card_last_shown_at: isoDaysAgo(2),
        },
      }),
      "user-1",
    );
    expect(result.eligible).toBe(true);
    expect(result.alreadyShownWithin24hr).toBe(false);
  });

  it("reads a never-stamped member as infinitely absent", async () => {
    const result = await getReturnCardEligibility(
      fakeClient({
        profileRow: {
          practice_shape: shape,
          last_seen_at: null,
          return_card_last_shown_at: null,
        },
      }),
      "user-1",
    );
    expect(result.daysSinceLastSeen).toBe(Infinity);
    expect(result.eligible).toBe(true);
  });

  it("closes the gate rather than throwing when the read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await getReturnCardEligibility(
      fakeClient({ throwOn: "select" }),
      "user-1",
    );
    expect(result.eligible).toBe(false);
  });
});

// ---------------------------------------------------------------------
// getPresenceForRange
// ---------------------------------------------------------------------

describe("getPresenceForRange", () => {
  const dayKey = (n: number) =>
    new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

  it("returns exactly `days` entries, oldest → newest, unique and contiguous", async () => {
    const days = await getPresenceForRange(
      fakeClient({ profileRow: null, journalRows: [] }),
      "user-1",
      14,
    );
    expect(days).toHaveLength(14);
    const dates = days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(14);
    expect(dates[13]).toBe(dayKey(0));
  });

  it("marks journal days and leaves the rest quiet", async () => {
    const days = await getPresenceForRange(
      fakeClient({
        profileRow: null,
        journalRows: [
          { created_at: isoDaysAgo(1) },
          { created_at: isoDaysAgo(3) },
          { created_at: isoDaysAgo(3) }, // same day twice → one signal
          { created_at: isoDaysAgo(8) },
        ],
      }),
      "user-1",
      14,
    );
    const signalled = days.filter((d) => d.hasSignal);
    expect(signalled).toHaveLength(3);
    for (const day of signalled) {
      expect(day.sources).toEqual(["journal"]);
    }
  });

  it("folds in the two profile singletons", async () => {
    const days = await getPresenceForRange(
      fakeClient({
        profileRow: {
          last_seen_at: isoDaysAgo(2),
          current_step_entered_at: isoDaysAgo(4),
        },
        journalRows: [{ created_at: isoDaysAgo(2) }],
      }),
      "user-1",
      14,
    );
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate[dayKey(2)].sources).toEqual(["journal", "last_seen"]);
    expect(byDate[dayKey(4)].sources).toEqual(["step_entered"]);
  });

  it("ignores signals outside the window", async () => {
    const days = await getPresenceForRange(
      fakeClient({
        profileRow: { last_seen_at: isoDaysAgo(90), current_step_entered_at: null },
        journalRows: [],
      }),
      "user-1",
      14,
    );
    expect(days.every((d) => !d.hasSignal)).toBe(true);
  });

  it("survives a null created_at rather than throwing on it", async () => {
    // journal_entries.created_at is nullable in the live schema, and
    // new Date(null).toISOString() throws — so a single bad row must
    // not blank the whole band.
    const days = await getPresenceForRange(
      fakeClient({
        profileRow: null,
        journalRows: [{ created_at: null }, { created_at: isoDaysAgo(1) }],
      }),
      "user-1",
      14,
    );
    expect(days.filter((d) => d.hasSignal)).toHaveLength(1);
  });

  it("returns a quiet band when the query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const days = await getPresenceForRange(
      fakeClient({ throwOn: "select" }),
      "user-1",
      14,
    );
    expect(days).toHaveLength(14);
    expect(days.every((d) => !d.hasSignal && d.sources.length === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------
// stampReturnCardShown
// ---------------------------------------------------------------------

describe("stampReturnCardShown", () => {
  it("writes the timestamp and reports success", async () => {
    const client = fakeClient({ updateError: null });
    await expect(stampReturnCardShown(client, "user-1")).resolves.toBe(true);
    const calls = (client as unknown as { updateCalls: Array<Record<string, unknown>> })
      .updateCalls;
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("profiles");
    expect(typeof calls[0].return_card_last_shown_at).toBe("string");
  });

  it("reports failure without throwing when the update errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      stampReturnCardShown(fakeClient({ updateError: { message: "boom" } }), "user-1"),
    ).resolves.toBe(false);
  });

  it("reports failure without throwing when the client itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      stampReturnCardShown(fakeClient({ throwOn: "update" }), "user-1"),
    ).resolves.toBe(false);
  });
});
