/**
 * Eidos — validation rules for the /api/v1/events ingestion endpoint.
 *
 * Pure functions, no DB access. The route handler calls
 * `validateIngestBody` after parsing JSON; the result either contains
 * a typed array of valid events or an error with the right HTTP
 * status. Caller is responsible for the HTTP response.
 *
 * Why hand-written instead of Zod: this is the only validation in the
 * Eidos app today and pulling in a runtime schema library for one
 * route is over-engineering. If Eidos adds two more validated routes,
 * promote to Zod or arktype.
 *
 * Spec: stone-harbor-docs/engineering/eidos/Eidos_Behavioral_Inference_Architecture.md §4
 */

export const MAX_EVENTS_PER_REQUEST = 1000;
export const MAX_EVENT_ID_LENGTH = 128;
export const MAX_USER_ID_LENGTH = 128;
export const MAX_TYPE_LENGTH = 64;

/**
 * Event type naming convention: lowercase dotted namespace, similar to
 * Segment's track event names. Examples:
 *   journal.created
 *   journal.content_analyzed
 *   mood.selected
 *   message.sent
 *
 * Validates that the type matches one or more lowercase identifiers
 * separated by dots. Identifiers must start with a letter and may
 * contain letters, digits, and underscores.
 */
export const TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export type IngestEvent = {
  event_id: string;
  user_id: string;
  type: string;
  timestamp: string; // ISO 8601
  payload: Record<string, unknown>;
};

export type ValidationResult =
  | { ok: true; events: IngestEvent[] }
  | { ok: false; status: number; error: string };

export function validateIngestBody(body: unknown): ValidationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "body must be a JSON object" };
  }
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.events)) {
    return {
      ok: false,
      status: 400,
      error: "body.events must be an array",
    };
  }
  if (obj.events.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "body.events must not be empty",
    };
  }
  if (obj.events.length > MAX_EVENTS_PER_REQUEST) {
    return {
      ok: false,
      status: 413,
      error: `body.events exceeds maximum of ${MAX_EVENTS_PER_REQUEST}`,
    };
  }

  const validated: IngestEvent[] = [];
  for (let i = 0; i < obj.events.length; i++) {
    const result = validateOneEvent(obj.events[i], i);
    if (!result.ok) {
      return result;
    }
    validated.push(result.event);
  }
  return { ok: true, events: validated };
}

type SingleResult =
  | { ok: true; event: IngestEvent }
  | { ok: false; status: number; error: string };

function validateOneEvent(value: unknown, index: number): SingleResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}] must be an object`,
    };
  }
  const e = value as Record<string, unknown>;

  if (
    typeof e.event_id !== "string" ||
    e.event_id.length === 0 ||
    e.event_id.length > MAX_EVENT_ID_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].event_id must be a non-empty string ≤${MAX_EVENT_ID_LENGTH} chars`,
    };
  }

  if (
    typeof e.user_id !== "string" ||
    e.user_id.length === 0 ||
    e.user_id.length > MAX_USER_ID_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].user_id must be a non-empty string ≤${MAX_USER_ID_LENGTH} chars`,
    };
  }

  if (
    typeof e.type !== "string" ||
    e.type.length === 0 ||
    e.type.length > MAX_TYPE_LENGTH
  ) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].type must be a non-empty string ≤${MAX_TYPE_LENGTH} chars`,
    };
  }
  if (!TYPE_PATTERN.test(e.type)) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].type must match lowercase dotted namespace (e.g. "journal.created")`,
    };
  }

  if (typeof e.timestamp !== "string" || isNaN(Date.parse(e.timestamp))) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].timestamp must be an ISO 8601 string`,
    };
  }

  let payload: Record<string, unknown>;
  if (e.payload === undefined || e.payload === null) {
    payload = {};
  } else if (typeof e.payload !== "object" || Array.isArray(e.payload)) {
    return {
      ok: false,
      status: 400,
      error: `events[${index}].payload must be an object`,
    };
  } else {
    payload = e.payload as Record<string, unknown>;
  }

  return {
    ok: true,
    event: {
      event_id: e.event_id,
      user_id: e.user_id,
      type: e.type,
      timestamp: e.timestamp,
      payload,
    },
  };
}
