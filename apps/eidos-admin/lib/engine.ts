/**
 * Eidos Admin — engine HTTP client.
 *
 * Server-only. Wraps `GET ${EIDOS_API_URL}/api/v1/members` and
 * `GET ${EIDOS_API_URL}/api/v1/members/:consumer_id/:user_id`. Both
 * are signed with the admin bearer token. The browser never sees the
 * URL or the token — this is a server-component-only module.
 *
 * Failure mode: throws on non-2xx. The page-level callers wrap with
 * an ErrorPanel render. We don't swallow because admin reads are
 * synchronous (a missing observation is a *null* in the response, not
 * an error). If the engine itself is unreachable, that's a visible
 * incident the admin needs to know about, not a silent skip.
 */

const API_URL = process.env.EIDOS_API_URL;
const API_TOKEN = process.env.EIDOS_ADMIN_API_TOKEN;

export interface MemberSummary {
  consumer_id: string;
  member_id: string;
  event_count: number;
  last_event: string;
}

export interface EventRow {
  event_id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface ObservationRow {
  id: string;
  window_start: string;
  window_end: string;
  sample_size: number;
  unique_days: number;
  centroid_hour: number | null;
  regularity_entropy: number | null;
  night_load_fraction: number | null;
  social_jet_lag_hours: number | null;
  confidence: number;
  evidence: {
    event_ids?: string[];
    hour_histogram?: number[];
    weekday_count?: number;
    weekend_count?: number;
  };
  computed_at: string;
}

export interface BaselineRow {
  trait_centroid_hour: number | null;
  trait_centroid_hour_stddev: number | null;
  trait_regularity_entropy: number | null;
  trait_regularity_entropy_stddev: number | null;
  trait_night_load_fraction: number | null;
  trait_night_load_fraction_stddev: number | null;
  trait_social_jet_lag_hours: number | null;
  sample_size: number;
  window_days: number;
  computed_at: string;
}

export interface MemberDetail {
  consumer_id: string;
  user_id: string;
  events: EventRow[];
  observation: ObservationRow | null;
  baseline: BaselineRow | null;
}

function assertConfigured(): { url: string; token: string } {
  if (!API_URL) {
    throw new Error("Missing EIDOS_API_URL");
  }
  if (!API_TOKEN) {
    throw new Error("Missing EIDOS_ADMIN_API_TOKEN");
  }
  return { url: API_URL.replace(/\/+$/, ""), token: API_TOKEN };
}

async function call<T>(path: string): Promise<T> {
  const { url, token } = assertConfigured();
  const res = await fetch(`${url}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "<unreadable>");
    throw new Error(`Engine returned ${res.status}: ${detail}`);
  }
  return (await res.json()) as T;
}

export async function listMembers(): Promise<{ members: MemberSummary[] }> {
  return call<{ members: MemberSummary[] }>("/api/v1/members");
}

export async function getMember(
  consumerId: string,
  userId: string,
): Promise<MemberDetail> {
  return call<MemberDetail>(
    `/api/v1/members/${encodeURIComponent(consumerId)}/${encodeURIComponent(userId)}`,
  );
}
