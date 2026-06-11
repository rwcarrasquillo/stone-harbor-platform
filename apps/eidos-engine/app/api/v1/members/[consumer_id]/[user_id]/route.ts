import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminToken } from "@/lib/auth/verifyAdminToken";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — `GET /api/v1/members/[consumer_id]/[user_id]`
 *
 * Returns the full spot-check payload for a single (consumer, member)
 * pair: raw events + latest circadian observation + circadian baseline.
 * One round-trip; apps/eidos-admin renders the whole spot-check page
 * from this response.
 *
 * Each panel can be null:
 *   - `observation` null when no `compute-circadian` cron has run yet
 *     for this member
 *   - `baseline` null when fewer than 3 observations have rolled up
 *
 * Auth: bearer EIDOS_ADMIN_API_TOKEN. Will fan out to consumer-scoped
 * tokens (limited to their own consumer) when the architecture grows
 * past one admin actor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ consumer_id: string; user_id: string }> },
) {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "unconfigured" ? 500 : 401 },
    );
  }

  const { consumer_id: consumerId, user_id: userId } = await ctx.params;
  const supabase = getServiceClient();

  // ── Events ──────────────────────────────────────────────────────
  const { data: events, error: eventsError } = await supabase
    .from("eidos_event_stream")
    .select("event_id, type, timestamp, payload")
    .eq("consumer_id", consumerId)
    .eq("user_id", userId)
    .order("timestamp", { ascending: false });

  if (eventsError) {
    return NextResponse.json(
      { error: "db_error", detail: eventsError.message },
      { status: 500 },
    );
  }

  // ── Latest circadian observation ────────────────────────────────
  const { data: observationRows, error: obsError } = await supabase
    .from("eidos_circadian_observations")
    .select(
      "id, window_start, window_end, sample_size, unique_days, centroid_hour, regularity_entropy, night_load_fraction, social_jet_lag_hours, confidence, evidence, computed_at",
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
      "trait_centroid_hour, trait_centroid_hour_stddev, trait_regularity_entropy, trait_regularity_entropy_stddev, trait_night_load_fraction, trait_night_load_fraction_stddev, trait_social_jet_lag_hours, sample_size, window_days, computed_at",
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

  return NextResponse.json({
    consumer_id: consumerId,
    user_id: userId,
    events: events ?? [],
    observation: observationRows?.[0] ?? null,
    baseline: baselineRows?.[0] ?? null,
  });
}
