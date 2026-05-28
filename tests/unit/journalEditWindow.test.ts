import { describe, expect, it } from "vitest";

import {
  JOURNAL_EDIT_WINDOW_MS,
  isWithinEditWindow,
} from "@/lib/journalEditWindow";

/**
 * Unit tests for the 6-hour edit window enforcement on journal
 * entries. The constant and helper live in the page module because
 * the same value is shared by the UI ("show edit affordance?") and
 * the save handler ("reject stale edits"). Centralizing it makes the
 * 6-hour policy auditable from one place.
 */

describe("isWithinEditWindow", () => {
  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

  it("matches the documented 6-hour window length", () => {
    expect(JOURNAL_EDIT_WINDOW_MS).toBe(SIX_HOURS_MS);
  });

  it("returns true for an entry created just now", () => {
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    expect(isWithinEditWindow(createdAt, now)).toBe(true);
  });

  it("returns true for an entry created 5 hours ago", () => {
    const now = Date.now();
    const fiveHoursAgo = new Date(now - 5 * 60 * 60 * 1000).toISOString();
    expect(isWithinEditWindow(fiveHoursAgo, now)).toBe(true);
  });

  it("returns true at exactly the 6-hour boundary", () => {
    // The boundary is inclusive — entries created exactly 6 hours
    // ago are still editable. The window closes a millisecond later.
    const now = Date.now();
    const exactlySixHoursAgo = new Date(now - SIX_HOURS_MS).toISOString();
    expect(isWithinEditWindow(exactlySixHoursAgo, now)).toBe(true);
  });

  it("returns false 1 millisecond past the 6-hour boundary", () => {
    const now = Date.now();
    const justPastBoundary = new Date(now - SIX_HOURS_MS - 1).toISOString();
    expect(isWithinEditWindow(justPastBoundary, now)).toBe(false);
  });

  it("returns false for an entry created 6.5 hours ago", () => {
    const now = Date.now();
    const sixAndAHalfHoursAgo = new Date(
      now - 6.5 * 60 * 60 * 1000,
    ).toISOString();
    expect(isWithinEditWindow(sixAndAHalfHoursAgo, now)).toBe(false);
  });

  it("returns false for an entry created a week ago", () => {
    const now = Date.now();
    const aWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinEditWindow(aWeekAgo, now)).toBe(false);
  });

  it("returns false for a malformed timestamp", () => {
    expect(isWithinEditWindow("not a real date")).toBe(false);
    expect(isWithinEditWindow("")).toBe(false);
  });

  it("defaults nowMs to Date.now() when omitted", () => {
    // Spot-check: createdAt = now → must be true regardless of clock.
    const createdAt = new Date().toISOString();
    expect(isWithinEditWindow(createdAt)).toBe(true);
  });
});
