import { describe, expect, it } from "vitest";

import {
  MAX_EVENTS_PER_REQUEST,
  validateIngestBody,
} from "./events";

/**
 * Validation tests for the /api/v1/events ingestion endpoint payload.
 * Pure unit tests — no DB, no HTTP. Drives every error path so the
 * route handler can stay focused on auth + persistence.
 */

const validEvent = {
  event_id: "evt_001",
  user_id: "user_001",
  type: "journal.created",
  timestamp: "2026-06-08T22:00:00Z",
  payload: { mood: "grounded", length: 412 },
};

describe("validateIngestBody — body shape", () => {
  it("rejects null body", () => {
    const r = validateIngestBody(null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/body must be a JSON object/);
    }
  });

  it("rejects array body", () => {
    const r = validateIngestBody([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects primitive body", () => {
    const r = validateIngestBody("not an object");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects missing events field", () => {
    const r = validateIngestBody({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/events must be an array/);
  });

  it("rejects events that isn't an array", () => {
    const r = validateIngestBody({ events: "nope" });
    expect(r.ok).toBe(false);
  });

  it("rejects empty events array", () => {
    const r = validateIngestBody({ events: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/must not be empty/);
  });

  it("rejects oversize batch", () => {
    const events = Array.from(
      { length: MAX_EVENTS_PER_REQUEST + 1 },
      (_, i) => ({ ...validEvent, event_id: `evt_${i}` }),
    );
    const r = validateIngestBody({ events });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(413);
      expect(r.error).toMatch(/exceeds maximum/);
    }
  });
});

describe("validateIngestBody — per-event fields", () => {
  it("accepts a single valid event", () => {
    const r = validateIngestBody({ events: [validEvent] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(1);
      expect(r.events[0]).toMatchObject(validEvent);
    }
  });

  it("accepts a batch of valid events", () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      ...validEvent,
      event_id: `evt_${i}`,
    }));
    const r = validateIngestBody({ events });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(5);
  });

  it("rejects missing event_id", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, event_id: undefined }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/event_id/);
  });

  it("rejects empty event_id", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, event_id: "" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects oversize event_id", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, event_id: "a".repeat(129) }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects missing user_id", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, user_id: undefined }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects type that doesn't match dotted namespace pattern", () => {
    const cases = [
      "Journal.Created",        // uppercase
      "journal-created",        // hyphen not allowed
      "journal..created",       // empty namespace segment
      ".journal.created",       // leading dot
      "journal.created.",       // trailing dot
      "1journal.created",       // starts with digit
      "journal create",         // space
    ];
    for (const type of cases) {
      const r = validateIngestBody({ events: [{ ...validEvent, type }] });
      expect(r.ok, `should reject type "${type}"`).toBe(false);
    }
  });

  it("accepts well-formed namespaced types", () => {
    const cases = [
      "journal",
      "journal.created",
      "journal.content_analyzed",
      "mood.selected",
      "message.sent",
      "safety_classifier.triggered",
      "a.b.c.d",
    ];
    for (const type of cases) {
      const r = validateIngestBody({ events: [{ ...validEvent, type }] });
      expect(r.ok, `should accept type "${type}"`).toBe(true);
    }
  });

  it("rejects non-ISO timestamp", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, timestamp: "not-a-date" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ISO 8601/);
  });

  it("accepts ISO timestamp with timezone offset", () => {
    const r = validateIngestBody({
      events: [
        { ...validEvent, timestamp: "2026-06-08T18:00:00-04:00" },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("treats missing payload as empty object", () => {
    const ev = { ...validEvent };
    delete (ev as Partial<typeof validEvent>).payload;
    const r = validateIngestBody({ events: [ev] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events[0].payload).toEqual({});
  });

  it("rejects payload that's an array", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, payload: [1, 2, 3] }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects payload that's a primitive", () => {
    const r = validateIngestBody({
      events: [{ ...validEvent, payload: "no" }],
    });
    expect(r.ok).toBe(false);
  });

  it("preserves payload contents on a valid event", () => {
    const payload = { nested: { value: 42 }, list: [1, 2] };
    const r = validateIngestBody({
      events: [{ ...validEvent, payload }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events[0].payload).toEqual(payload);
  });
});
