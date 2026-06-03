/**
 * Stone Harbor — surfacer unit tests.
 *
 * These tests are the editorial guarantee for the Story Series. They
 * encode the rules the prompt pool's authors care about: depth cap,
 * pending-wins, snooze respect, re-surface eligibility, un-shown
 * preference. Anything that changes the harbor's surface order must
 * pass through here first.
 */

import { describe, expect, it } from "vitest";
import { isFounderEmail } from "../founderGate";
import {
  DEFAULT_SKIP_COOLDOWN_DAYS,
  MVP_MAX_DEPTH,
  pickNextPrompt,
} from "../surfacer";
import type {
  MemberStoryInvitation,
  StoryDepth,
  StoryPrompt,
  SurfaceContext,
} from "../types";

const NOW = new Date("2026-06-01T12:00:00Z");

function makePrompt(overrides: Partial<StoryPrompt> = {}): StoryPrompt {
  return {
    id: overrides.id ?? `prompt-${Math.random().toString(36).slice(2, 8)}`,
    consumer_slug: "stone_harbor",
    language: "en",
    series_slug: "dad",
    prompt_text: "test prompt",
    depth: 1,
    themes: ["origin"],
    est_minutes: 5,
    re_surface_eligible: true,
    order_hint: 100,
    active: true,
    source_ref: null,
    regional_variants: {},
    ...overrides,
  };
}

function makeInvitation(
  overrides: Partial<MemberStoryInvitation>
): MemberStoryInvitation {
  return {
    id: overrides.id ?? `inv-${Math.random().toString(36).slice(2, 8)}`,
    member_id: "member-1",
    prompt_id: overrides.prompt_id ?? "prompt-x",
    status: "pending",
    shown_at: overrides.shown_at ?? NOW.toISOString(),
    responded_at: null,
    snooze_until: null,
    response_journal_entry_id: null,
    telemetry: {},
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function ctx(
  pool: StoryPrompt[],
  history: MemberStoryInvitation[] = [],
  maxDepth: StoryDepth = MVP_MAX_DEPTH
): SurfaceContext {
  return { pool, history, now: NOW, maxDepth };
}

describe("pickNextPrompt", () => {
  it("returns none when pool is empty", () => {
    const result = pickNextPrompt(ctx([]));
    expect(result.kind).toBe("none");
  });

  it("filters out prompts beyond maxDepth", () => {
    const pool = [
      makePrompt({ id: "l3", depth: 3, order_hint: 1 }),
      makePrompt({ id: "l4", depth: 4, order_hint: 1 }),
    ];
    const result = pickNextPrompt(ctx(pool));
    expect(result.kind).toBe("none");
  });

  it("returns an existing pending invitation if one is in flight", () => {
    const pool = [
      makePrompt({ id: "a", depth: 1, order_hint: 1 }),
      makePrompt({ id: "b", depth: 1, order_hint: 2 }),
    ];
    const pending = makeInvitation({
      id: "inv-a",
      prompt_id: "a",
      status: "pending",
    });
    const result = pickNextPrompt(ctx(pool, [pending]));
    expect(result.kind).toBe("existing_pending");
    if (result.kind === "existing_pending") {
      expect(result.invitation.id).toBe("inv-a");
    }
  });

  it("prefers un-shown prompts over re-surface candidates", () => {
    const pool = [
      makePrompt({ id: "answered", depth: 1, order_hint: 1, re_surface_eligible: true }),
      makePrompt({ id: "unshown", depth: 1, order_hint: 2 }),
    ];
    const history = [
      makeInvitation({
        prompt_id: "answered",
        status: "answered",
        shown_at: "2026-05-01T00:00:00Z",
      }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.promptId).toBe("unshown");
    }
  });

  it("excludes prompts answered when not re_surface_eligible", () => {
    const pool = [
      makePrompt({ id: "p1", depth: 1, order_hint: 1, re_surface_eligible: false }),
    ];
    const history = [
      makeInvitation({
        prompt_id: "p1",
        status: "answered",
      }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("none");
  });

  it("suppresses prompts within their snooze window after skip", () => {
    const pool = [makePrompt({ id: "p1", depth: 1, order_hint: 1 })];
    const future = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const history = [
      makeInvitation({
        prompt_id: "p1",
        status: "skipped",
        snooze_until: future,
      }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("none");
  });

  it("re-surfaces a skipped prompt once the snooze window has elapsed", () => {
    const pool = [makePrompt({ id: "p1", depth: 1, order_hint: 1 })];
    const past = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const history = [
      makeInvitation({
        prompt_id: "p1",
        status: "skipped",
        snooze_until: past,
      }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.promptId).toBe("p1");
    }
  });

  it("never re-surfaces a dismissed prompt", () => {
    const pool = [
      makePrompt({ id: "dismissed", depth: 1, order_hint: 1 }),
      makePrompt({ id: "alt", depth: 1, order_hint: 2 }),
    ];
    const history = [
      makeInvitation({ prompt_id: "dismissed", status: "dismissed" }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.promptId).toBe("alt");
    }
  });

  it("orders by depth ASC, then order_hint ASC within the un-shown band", () => {
    const pool = [
      makePrompt({ id: "depth2-early", depth: 2, order_hint: 201 }),
      makePrompt({ id: "depth1-late", depth: 1, order_hint: 105 }),
      makePrompt({ id: "depth1-early", depth: 1, order_hint: 101 }),
    ];
    const result = pickNextPrompt(ctx(pool));
    expect(result.kind).toBe("create");
    if (result.kind === "create") {
      expect(result.promptId).toBe("depth1-early");
    }
  });

  it("uses only the most-recent invitation per prompt when judging state", () => {
    const pool = [makePrompt({ id: "p1", depth: 1, order_hint: 1, re_surface_eligible: true })];
    const history = [
      // Old: skipped + still snoozed → would suppress on its own.
      makeInvitation({
        id: "old",
        prompt_id: "p1",
        status: "skipped",
        snooze_until: new Date(NOW.getTime() + 10 * 24 * 3600 * 1000).toISOString(),
        shown_at: "2026-05-01T00:00:00Z",
      }),
      // New: answered → re_surface_eligible kicks in, prompt is candidate.
      makeInvitation({
        id: "new",
        prompt_id: "p1",
        status: "answered",
        shown_at: "2026-05-15T00:00:00Z",
      }),
    ];
    const result = pickNextPrompt(ctx(pool, history));
    expect(result.kind).toBe("create");
  });

  it("MVP_MAX_DEPTH is 2", () => {
    expect(MVP_MAX_DEPTH).toBe(2);
  });

  it("DEFAULT_SKIP_COOLDOWN_DAYS is 7", () => {
    expect(DEFAULT_SKIP_COOLDOWN_DAYS).toBe(7);
  });
});

describe("isFounderEmail", () => {
  it("matches the founder email exactly", () => {
    expect(isFounderEmail("rafael.carrasquillo@gmail.com")).toBe(true);
  });

  it("is case-insensitive + tolerates whitespace", () => {
    expect(isFounderEmail("  RAFAEL.CARRASQUILLO@gmail.com  ")).toBe(true);
  });

  it("rejects any other email", () => {
    expect(isFounderEmail("someone@else.com")).toBe(false);
  });

  it("rejects null + empty", () => {
    expect(isFounderEmail(null)).toBe(false);
    expect(isFounderEmail(undefined)).toBe(false);
    expect(isFounderEmail("")).toBe(false);
  });
});
