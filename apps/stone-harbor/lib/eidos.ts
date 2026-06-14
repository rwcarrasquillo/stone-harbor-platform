/**
 * Stone Harbor — Eidos event emit helper (server-only).
 *
 * Wraps `POST /api/v1/events` on the standalone Eidos engine so the
 * call site only thinks about what happened, not the HTTP/auth shape.
 * Read by `/api/events/emit/route.ts`, which is the *only* place this
 * module should be imported from — the consumer token lives in
 * server-only env vars and must never reach the browser.
 *
 * Fire-and-forget by contract: the helper never throws to the caller.
 * Network errors, 4xx, 5xx are all logged via `console.error` and
 * swallowed. Member-facing flows must never block or fail because an
 * event push failed.
 *
 * Batching, retry queues, and durable buffers are explicitly out of
 * scope — single-event POST per call is fine until we have volume.
 * (See SH-36 for the v1 scope decision.)
 */

const DEFAULT_INGEST_URL = "https://eidos.stoneharbor.app/api/v1/events";

/**
 * Allowed event types that Stone Harbor can push. The matching
 * regex on the Eidos side is `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$`,
 * so any new entry must match that namespace shape.
 *
 * Adding a type here also requires adding it to the allowlist in
 * `/api/events/emit/route.ts` — clients shouldn't be able to push
 * arbitrary types, and server-internal events (e.g. a future
 * `safety_classifier.triggered`) should never be in the client-
 * facing allowlist at all.
 */
export type EidosEventType =
  | "journal.created"
  | "vent.created"
  | "safety_classifier.triggered";

export interface EmitEidosEventArgs {
  /** Discriminator for the event. */
  type: EidosEventType;
  /** Supabase `auth.users.id` of the member the event belongs to. */
  user_id: string;
  /** Arbitrary JSON-serializable payload. Defaults to `{}`. */
  payload?: Record<string, unknown>;
  /**
   * Optional caller-supplied id. If omitted, an `evt_<uuid>` is
   * generated. Idempotency on the Eidos side is keyed by
   * `(consumer_id, event_id)` — pass a deterministic id when
   * the call site can fire more than once for the same logical
   * event (e.g. React strict-mode double mount).
   */
  event_id?: string;
  /** Optional caller-supplied ISO 8601 timestamp. Defaults to `now`. */
  timestamp?: string;
}

/**
 * Push a single event to the Eidos ingestion endpoint.
 *
 * Returns once the HTTP response has been observed or an error has
 * been logged. Never rejects: the returned Promise always resolves.
 * Callers are free to `await` it (when ordering matters) or fire it
 * without await (the default for member-facing flows).
 */
export async function emitEidosEvent(
  args: EmitEidosEventArgs,
): Promise<void> {
  const token = process.env.EIDOS_CONSUMER_TOKEN;
  if (!token) {
    // Missing token is a deploy bug, not a runtime user issue. Log
    // loudly so it shows up in Sentry/Vercel logs but don't throw —
    // a missing event push must not surface to the member.
    console.error("[eidos] EIDOS_CONSUMER_TOKEN is not set; skipping emit", {
      type: args.type,
    });
    return;
  }

  const url = process.env.EIDOS_INGEST_URL ?? DEFAULT_INGEST_URL;
  const event_id = args.event_id ?? `evt_${randomId()}`;
  const timestamp = args.timestamp ?? new Date().toISOString();
  const payload = args.payload ?? {};

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        events: [
          {
            event_id,
            user_id: args.user_id,
            type: args.type,
            timestamp,
            payload,
          },
        ],
      }),
    });

    if (!res.ok) {
      // Read body best-effort for the log. Eidos returns small JSON
      // error bodies, so this won't blow up on size.
      const body = await res.text().catch(() => "<unreadable>");
      console.error("[eidos] emit failed", {
        type: args.type,
        user_id: args.user_id,
        status: res.status,
        body,
      });
    }
  } catch (err) {
    // Network failure, DNS, abort, etc. Same rule: log + swallow.
    console.error("[eidos] emit threw", {
      type: args.type,
      user_id: args.user_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Lightweight UUID-ish generator. Prefers `crypto.randomUUID()`
 * (available in Node 19+, edge runtime, and the browser) and falls
 * back to a hex-ish random string for the unlikely environment that
 * lacks it. Either way the result is 32+ chars of entropy — well
 * above what the Eidos endpoint requires.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Array.from({ length: 4 }, () =>
    Math.random().toString(16).slice(2, 10),
  ).join("");
}

// ============================================================================
// SH-40 — Read side: fetch own member's inferences for the Rhythm surface.
// ============================================================================
// Server-only counterpart to emitEidosEvent. Wraps
// `GET /api/v1/consumers/me/members/[user_id]/inferences` on the Eidos
// engine (built in EID-52). The route uses the same consumer token that
// the push side does, with the `inferences:read` scope added in EID-52.
//
// Read failures are NOT silently swallowed: a missing observation is a
// valid 200 response with `null` fields, but a network error or 5xx
// is something the caller should handle visibly (because the member is
// looking at the page expecting a rendered result, unlike the push
// side where the call is fire-and-forget under an existing action).
//
// Auth model: server-only, same shape as the push helper. Never call
// from a client component — the route at /api/eidos/inferences is the
// only entry from the browser.

const DEFAULT_INFERENCES_URL_TEMPLATE =
  "https://eidos.stoneharbor.app/api/v1/consumers/me/members/{user_id}/inferences";

export interface CircadianMetrics {
  centroid_hour: number | null;
  regularity_entropy: number | null;
  night_load_fraction: number | null;
  social_jet_lag_hours: number | null;
}

export interface CircadianObservationRead {
  computed_at: string;
  confidence: number;
  window_start: string;
  window_end: string;
  sample_size: number;
  unique_days: number;
  metrics: CircadianMetrics;
  evidence: {
    event_ids?: string[];
    hour_histogram?: number[];
    weekday_count?: number;
    weekend_count?: number;
  };
}

export interface OwnInferencesResponse {
  user_id: string;
  observations: {
    circadian: CircadianObservationRead | null;
  };
  baseline: {
    circadian: unknown | null;
  };
}

export type FetchOwnInferencesResult =
  | { ok: true; data: OwnInferencesResponse }
  | { ok: false; reason: "not_found" | "unauthorized" | "engine_error"; detail?: string };

/**
 * Server-only: fetch the current member's own Eidos inferences from
 * the engine. Returns a discriminated union so the page can render the
 * three meaningful states (have data, no events yet, engine
 * unreachable) without throwing.
 */
export async function fetchOwnInferences(
  userId: string,
): Promise<FetchOwnInferencesResult> {
  const token = process.env.EIDOS_CONSUMER_TOKEN;
  if (!token) {
    console.error(
      "[eidos] EIDOS_CONSUMER_TOKEN is not set; cannot fetch inferences",
    );
    return {
      ok: false,
      reason: "engine_error",
      detail: "EIDOS_CONSUMER_TOKEN is not configured",
    };
  }

  const template =
    process.env.EIDOS_INFERENCES_URL_TEMPLATE ?? DEFAULT_INFERENCES_URL_TEMPLATE;
  const url = template.replace("{user_id}", encodeURIComponent(userId));

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) {
      return { ok: false, reason: "not_found" };
    }
    if (res.status === 401 || res.status === 403) {
      const detail = await res.text().catch(() => "<unreadable>");
      console.error("[eidos] fetchOwnInferences auth failed", {
        status: res.status,
        detail,
      });
      return { ok: false, reason: "unauthorized", detail };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "<unreadable>");
      console.error("[eidos] fetchOwnInferences non-2xx", {
        status: res.status,
        detail,
      });
      return { ok: false, reason: "engine_error", detail };
    }
    const data = (await res.json()) as OwnInferencesResponse;
    return { ok: true, data };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[eidos] fetchOwnInferences threw", { detail });
    return { ok: false, reason: "engine_error", detail };
  }
}
