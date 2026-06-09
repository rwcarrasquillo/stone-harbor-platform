import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { verifyConsumerToken } from "@/lib/auth/verifyConsumerToken";
import { getServiceClient } from "@/lib/supabase/server";
import { validateIngestBody } from "@/lib/validation/events";

/**
 * Eidos Engine — POST /api/v1/events
 *
 * The integration contract surface. Every host platform (Stone
 * Harbor today, future partners) pushes behavioral events here.
 *
 * Request:
 *   Authorization: Bearer <consumer_token>
 *   Body: { events: [{ event_id, user_id, type, timestamp, payload }] }
 *
 * Response (200):
 *   { accepted: number, deduped: number }
 *   accepted + deduped == events.length always.
 *
 * Error responses:
 *   401 — missing/invalid Authorization header, or token not found
 *   403 — token recognized but lacks the events:write scope, or the
 *         consumer is paused/revoked
 *   400 — malformed JSON, or payload validation failed
 *   413 — batch exceeds 1000 events
 *   500 — DB insert failed
 *
 * Idempotency:
 *   Deduplication is by (consumer_id, event_id). Hosts can safely
 *   retry the same event_id — the second attempt counts in `deduped`,
 *   not `accepted`. This is what makes the push-event pattern
 *   resilient to network failures.
 *
 * Observability:
 *   Every request — success or failure — is logged to
 *   eidos_ingest_log with consumer_id, token_prefix, http_status,
 *   counts, and any error. This is the forensic trail for
 *   debugging integration issues with hosts.
 *
 * Spec: stone-harbor-docs/engineering/eidos/Eidos_Behavioral_Inference_Architecture.md §4
 */

export const dynamic = "force-dynamic";
// node:crypto + node:supabase-js need the Node runtime, not Edge.
export const runtime = "nodejs";

const ENDPOINT = "/api/v1/events";

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-vercel-id") ?? randomUUID();

  // ── Auth ─────────────────────────────────────────────────
  const auth = await verifyConsumerToken(
    req.headers.get("authorization"),
    "events:write",
  );

  if (!auth.ok) {
    const status = pickAuthFailureStatus(auth.reason);
    await logIngest({
      consumer_id: null,
      token_prefix: auth.token_prefix,
      http_status: status,
      events_received: null,
      events_accepted: null,
      events_deduped: null,
      error_message: `auth_failed: ${auth.reason}`,
      request_id: requestId,
    });
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status },
    );
  }

  // ── Parse JSON ───────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    await logIngest({
      consumer_id: auth.consumer_id,
      token_prefix: auth.token_prefix,
      http_status: 400,
      events_received: null,
      events_accepted: null,
      events_deduped: null,
      error_message: "invalid_json",
      request_id: requestId,
    });
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // ── Validate ─────────────────────────────────────────────
  const validation = validateIngestBody(rawBody);
  if (!validation.ok) {
    const receivedCount = countEventsLoose(rawBody);
    await logIngest({
      consumer_id: auth.consumer_id,
      token_prefix: auth.token_prefix,
      http_status: validation.status,
      events_received: receivedCount,
      events_accepted: null,
      events_deduped: null,
      error_message: `validation_failed: ${validation.error}`,
      request_id: requestId,
    });
    return NextResponse.json(
      { error: "validation_failed", detail: validation.error },
      { status: validation.status },
    );
  }

  const events = validation.events;

  // ── Insert ───────────────────────────────────────────────
  const supabase = getServiceClient();
  const rows = events.map((e) => ({
    consumer_id: auth.consumer_id,
    user_id: e.user_id,
    event_id: e.event_id,
    type: e.type,
    timestamp: e.timestamp,
    payload: e.payload,
  }));

  // upsert with ignoreDuplicates collapses to ON CONFLICT DO NOTHING
  // on the (consumer_id, event_id) unique index, returning only the
  // rows actually inserted. The count delta to events.length gives
  // us the deduped count.
  const { data: inserted, error: insertError } = await supabase
    .from("eidos_event_stream")
    .upsert(rows, {
      onConflict: "consumer_id,event_id",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertError) {
    await logIngest({
      consumer_id: auth.consumer_id,
      token_prefix: auth.token_prefix,
      http_status: 500,
      events_received: events.length,
      events_accepted: null,
      events_deduped: null,
      error_message: `db_error: ${insertError.message}`,
      request_id: requestId,
    });
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  const acceptedCount = inserted?.length ?? 0;
  const dedupedCount = events.length - acceptedCount;

  await logIngest({
    consumer_id: auth.consumer_id,
    token_prefix: auth.token_prefix,
    http_status: 200,
    events_received: events.length,
    events_accepted: acceptedCount,
    events_deduped: dedupedCount,
    error_message: null,
    request_id: requestId,
  });

  return NextResponse.json({
    accepted: acceptedCount,
    deduped: dedupedCount,
  });
}

/**
 * Map a verify-failure reason to the right HTTP status. Distinguishes
 * "you didn't bring a key" (401) from "the key you brought isn't
 * allowed to do this" (403) — relevant for partner debugging.
 */
function pickAuthFailureStatus(
  reason:
    | "missing_token"
    | "malformed_header"
    | "unknown_token"
    | "revoked"
    | "expired"
    | "insufficient_scope"
    | "consumer_inactive",
): 401 | 403 {
  switch (reason) {
    case "missing_token":
    case "malformed_header":
    case "unknown_token":
      return 401;
    case "revoked":
    case "expired":
    case "insufficient_scope":
    case "consumer_inactive":
      return 403;
  }
}

/**
 * Best-effort count of events from a raw (possibly invalid) body so
 * the validation-failure log row still carries an `events_received`
 * value when the body is *shaped* correctly enough to count events.
 */
function countEventsLoose(rawBody: unknown): number | null {
  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    const eventsField = (rawBody as { events?: unknown }).events;
    if (Array.isArray(eventsField)) {
      return eventsField.length;
    }
  }
  return null;
}

/**
 * Write one row to eidos_ingest_log. Failures here are logged to
 * stderr but do NOT propagate — losing a log row should never break
 * the response.
 */
async function logIngest(row: {
  consumer_id: string | null;
  token_prefix: string | null;
  http_status: number;
  events_received: number | null;
  events_accepted: number | null;
  events_deduped: number | null;
  error_message: string | null;
  request_id: string;
}): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("eidos_ingest_log").insert({
      endpoint: ENDPOINT,
      ...row,
    });
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[eidos.ingest] log insert failed:", error.message);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[eidos.ingest] log insert threw:", err);
  }
}
