import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyConsumerToken } from "@/lib/auth/verifyConsumerToken";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — `GET /api/v1/consumers/me/members/[user_id]/inferences`
 *
 * Third HTTP auth path on the engine (alongside consumer→write and
 * admin→cross-consumer-read): **consumer reads its OWN member's
 * inference data**, so the host can render the result back to the
 * member.
 *
 * Why this exists
 * ---------------
 * Without this endpoint a host can push events into Eidos but can't
 * show the resulting observations back to the user. That makes every
 * consumer-facing inference feature impossible — Anchors (SH-40) is
 * the first concrete product surface this unblocks.
 *
 * Auth
 * ----
 * Bearer consumer token via `verifyConsumerToken` with required scope
 * `inferences:read`. The token's row resolves to a `consumer_id`,
 * and every DB query is scoped to that consumer_id. There is no way
 * for one consumer to probe another consumer's member IDs — the path
 * is literally `/consumers/me/...`.
 *
 * The admin API token is intentionally NOT accepted here. Admin reads
 * use the existing cross-consumer endpoint at
 * `/api/v1/members/[c]/[u]` which has the right semantic (you have to
 * specify which consumer you're looking at). Trying to overload this
 * endpoint with both auth modes adds complexity for no real win.
 *
 * Scope check
 * -----------
 * Before fetching observations/baselines, we verify the user_id
 * exists under this consumer_id in `eidos_event_stream`. This makes
 * the 404-vs-403 distinction deterministic:
 *   - user_id doesn't exist under this consumer → 404 not_found
 *   - user_id exists, no observations yet      → 200 with null fields
 *   - user_id exists, observations populated   → 200 with data
 *
 * The 404 doesn't leak whether the user_id exists under a *different*
 * consumer — it just says "not yours."
 *
 * Three-layer pattern on the host
 * -------------------------------
 * Hosts must call this from server code only — client wrapper →
 * server proxy → server-only consumer token. Same shape SH-36
 * established for the push direction. See
 * [[stone-harbor-eidos-push-pattern]] memory.
 *
 * Shape
 * -----
 * Currently returns the circadian construct only. As Wave 2 + 3
 * constructs ship, each adds another key under `observations`. The
 * shape is forward-compatible — a host that doesn't recognize a new
 * construct key just ignores it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CircadianObservation {
  computed_at: string;
  confidence: number;
  window_start: string;
  window_end: string;
  sample_size: number;
  unique_days: number;
  metrics: {
    centroid_hour: number | null;
    regularity_entropy: number | null;
    night_load_fraction: number | null;
    social_jet_lag_hours: number | null;
  };
  evidence: unknown;
}

interface CircadianBaseline {
  computed_at: string;
  window_days: number;
  sample_size: number;
  metrics: {
    trait_centroid_hour: number | null;
    trait_centroid_hour_stddev: number | null;
    trait_regularity_entropy: number | null;
    trait_regularity_entropy_stddev: number | null;
    trait_night_load_fraction: number | null;
    trait_night_load_fraction_stddev: number | null;
    trait_social_jet_lag_hours: number | null;
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
) {
  const auth = await verifyConsumerToken(
    req.headers.get("authorization"),
    "inferences:read",
  );
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: "unauthorized",
        reason: auth.reason,
        token_prefix: auth.token_prefix,
      },
      {
        status:
          auth.reason === "insufficient_scope"
            ? 403
            : auth.reason === "consumer_inactive"
              ? 403
              : 401,
      },
    );
  }

  const { user_id: userId } = await ctx.params;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "bad_request", detail: "user_id is required" },
      { status: 400 },
    );
  }

  const consumerId = auth.consumer_id;
  const supabase = getServiceClient();

  // ── Existence check (anti-probe) ────────────────────────────────
  // Verify this (consumer_id, user_id) tuple has actually produced
  // events. Without this check a consumer could enumerate user_ids
  // by observing 200-vs-null response shapes; with it, unknown
  // user_ids look identical to user_ids that belong to a different
  // consumer (404 either way).
  const { data: eventCheck, error: checkError } = await supabase
    .from("eidos_event_stream")
    .select("event_id", { count: "exact", head: true })
    .eq("consumer_id", consumerId)
    .eq("user_id", userId)
    .limit(1);

  if (checkError) {
    return NextResponse.json(
      { error: "db_error", detail: checkError.message },
      { status: 500 },
    );
  }
  // `eventCheck` is `null` when head:true — use the supabase client's
  // count field via a follow-up query if we need the actual count.
  // For existence we just do a normal select(limit 1) instead.
  void eventCheck;

  const { data: anyEvent, error: anyEventError } = await supabase
    .from("eidos_event_stream")
    .select("event_id")
    .eq("consumer_id", consumerId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (anyEventError) {
    return NextResponse.json(
      { error: "db_error", detail: anyEventError.message },
      { status: 500 },
    );
  }
  if (!anyEvent) {
    return NextResponse.json(
      {
        error: "not_found",
        detail: "user_id has no events under this consumer",
      },
      { status: 404 },
    );
  }

  // ── Latest circadian observation ─────────────────────────────────
  const { data: obsRows, error: obsError } = await supabase
    .from("eidos_circadian_observations")
    .select(
      "computed_at, confidence, window_start, window_end, sample_size, unique_days, centroid_hour, regularity_entropy, night_load_fraction, social_jet_lag_hours, evidence",
    )
    .eq("consumer_id", consumerId)
    .eq("member_id", userId)
    .order("computed_at", { ascending: false })
    .limit(1);

  if (obsError) {
    return NextResponse.json(
      { error: "db_error", detail: obsError.message },
      { status: 500 },
    );
  }

  // ── Baseline ────────────────────────────────────────────────────
  const { data: baselineRows, error: baselineError } = await supabase
    .from("eidos_circadian_baselines")
    .select(
      "computed_at, window_days, sample_size, trait_centroid_hour, trait_centroid_hour_stddev, trait_regularity_entropy, trait_regularity_entropy_stddev, trait_night_load_fraction, trait_night_load_fraction_stddev, trait_social_jet_lag_hours",
    )
    .eq("consumer_id", consumerId)
    .eq("member_id", userId)
    .limit(1);

  if (baselineError) {
    return NextResponse.json(
      { error: "db_error", detail: baselineError.message },
      { status: 500 },
    );
  }

  // ── Shape the response ──────────────────────────────────────────
  // Strip cross-consumer fields, reshape DB-flat columns into nested
  // metrics objects so the host doesn't have to know about column
  // naming conventions on the engine side.
  const obsRow = obsRows?.[0];
  const circadianObservation: CircadianObservation | null = obsRow
    ? {
        computed_at: obsRow.computed_at as string,
        confidence: obsRow.confidence as number,
        window_start: obsRow.window_start as string,
        window_end: obsRow.window_end as string,
        sample_size: obsRow.sample_size as number,
        unique_days: obsRow.unique_days as number,
        metrics: {
          centroid_hour: obsRow.centroid_hour as number | null,
          regularity_entropy: obsRow.regularity_entropy as number | null,
          night_load_fraction: obsRow.night_load_fraction as number | null,
          social_jet_lag_hours: obsRow.social_jet_lag_hours as number | null,
        },
        evidence: obsRow.evidence,
      }
    : null;

  const baselineRow = baselineRows?.[0];
  const circadianBaseline: CircadianBaseline | null = baselineRow
    ? {
        computed_at: baselineRow.computed_at as string,
        window_days: baselineRow.window_days as number,
        sample_size: baselineRow.sample_size as number,
        metrics: {
          trait_centroid_hour: baselineRow.trait_centroid_hour as number | null,
          trait_centroid_hour_stddev:
            baselineRow.trait_centroid_hour_stddev as number | null,
          trait_regularity_entropy:
            baselineRow.trait_regularity_entropy as number | null,
          trait_regularity_entropy_stddev:
            baselineRow.trait_regularity_entropy_stddev as number | null,
          trait_night_load_fraction:
            baselineRow.trait_night_load_fraction as number | null,
          trait_night_load_fraction_stddev:
            baselineRow.trait_night_load_fraction_stddev as number | null,
          trait_social_jet_lag_hours:
            baselineRow.trait_social_jet_lag_hours as number | null,
        },
      }
    : null;

  return NextResponse.json({
    user_id: userId,
    observations: {
      circadian: circadianObservation,
    },
    baseline: {
      circadian: circadianBaseline,
    },
  });
}
