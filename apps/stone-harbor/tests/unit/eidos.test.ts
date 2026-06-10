import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emitEidosEvent } from "@/lib/eidos";

/**
 * Stone Harbor — emitEidosEvent unit tests.
 *
 * Pure logic. `fetch` is mocked globally; no real HTTP, no Eidos,
 * no env file. The helper's contract is intentionally narrow:
 *   - never throw to the caller
 *   - send a well-formed POST to the configured URL
 *   - fill in `event_id` + `timestamp` when omitted
 *   - preserve them verbatim when supplied
 *   - log + swallow on missing token, on non-2xx, on fetch reject
 */

const ORIGINAL_TOKEN = process.env.EIDOS_CONSUMER_TOKEN;
const ORIGINAL_URL = process.env.EIDOS_INGEST_URL;

let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.EIDOS_CONSUMER_TOKEN = "test_token_xyz";
  delete process.env.EIDOS_INGEST_URL;

  fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ accepted: 1, deduped: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  // Node 19+ / vitest provide globalThis.fetch — replace it for the
  // duration of the test.
  vi.stubGlobal("fetch", fetchMock);

  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.EIDOS_CONSUMER_TOKEN;
  } else {
    process.env.EIDOS_CONSUMER_TOKEN = ORIGINAL_TOKEN;
  }
  if (ORIGINAL_URL === undefined) {
    delete process.env.EIDOS_INGEST_URL;
  } else {
    process.env.EIDOS_INGEST_URL = ORIGINAL_URL;
  }
});

function parseFetchBody(): {
  events: Array<{
    event_id: string;
    user_id: string;
    type: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
} {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("emitEidosEvent — request shape", () => {
  it("posts to the default ingest URL when no override is set", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://eidos.stoneharbor.app/api/v1/events",
    );
  });

  it("honors EIDOS_INGEST_URL when set", async () => {
    process.env.EIDOS_INGEST_URL = "https://staging.example.com/api/v1/events";
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://staging.example.com/api/v1/events",
    );
  });

  it("sends Bearer auth header with the consumer token", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test_token_xyz");
  });

  it("sends Content-Type: application/json", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("uses POST", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
  });

  it("wraps the event in an events: [] batch", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
      payload: { mood: "grounded" },
    });
    const body = parseFetchBody();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("journal.created");
    expect(body.events[0].user_id).toBe("user_abc");
    expect(body.events[0].payload).toEqual({ mood: "grounded" });
  });

  it("defaults payload to {} when omitted", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const body = parseFetchBody();
    expect(body.events[0].payload).toEqual({});
  });
});

describe("emitEidosEvent — event_id + timestamp generation", () => {
  it("auto-generates an event_id with the evt_ prefix when omitted", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const body = parseFetchBody();
    expect(body.events[0].event_id).toMatch(/^evt_/);
    // 32+ chars of entropy after the prefix.
    expect(body.events[0].event_id.length).toBeGreaterThanOrEqual(36);
  });

  it("auto-generates a valid ISO 8601 timestamp when omitted", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
    });
    const body = parseFetchBody();
    const ts = body.events[0].timestamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("preserves caller-supplied event_id verbatim", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
      event_id: "evt_custom_123",
    });
    const body = parseFetchBody();
    expect(body.events[0].event_id).toBe("evt_custom_123");
  });

  it("preserves caller-supplied timestamp verbatim", async () => {
    await emitEidosEvent({
      type: "journal.created",
      user_id: "user_abc",
      timestamp: "2026-06-08T22:00:00Z",
    });
    const body = parseFetchBody();
    expect(body.events[0].timestamp).toBe("2026-06-08T22:00:00Z");
  });
});

describe("emitEidosEvent — failure modes never throw", () => {
  it("logs + returns when EIDOS_CONSUMER_TOKEN is missing", async () => {
    delete process.env.EIDOS_CONSUMER_TOKEN;
    await expect(
      emitEidosEvent({ type: "journal.created", user_id: "user_abc" }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("EIDOS_CONSUMER_TOKEN"),
      expect.any(Object),
    );
  });

  it("does not throw when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      emitEidosEvent({ type: "journal.created", user_id: "user_abc" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("emit threw"),
      expect.objectContaining({ error: "ECONNRESET" }),
    );
  });

  it("does not throw on a 401 response (unknown token)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "unauthorized", reason: "unknown_token" }),
        { status: 401 },
      ),
    );
    await expect(
      emitEidosEvent({ type: "journal.created", user_id: "user_abc" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("emit failed"),
      expect.objectContaining({ status: 401 }),
    );
  });

  it("does not throw on a 500 response (db_error)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "db_error" }), { status: 500 }),
    );
    await expect(
      emitEidosEvent({ type: "journal.created", user_id: "user_abc" }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("emit failed"),
      expect.objectContaining({ status: 500 }),
    );
  });
});
