import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { circularMeanHour } from "@/lib/circadian";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — Circadian baseline cron (EID-20).
 *
 * GET /api/eidos/baseline-circadian
 * Authorization: Bearer <EIDOS_CRON_SECRET>
 *
 * Reads the rolling history of `eidos_circadian_observations` rows for
 * each member and produces one `eidos_circadian_baselines` row per
 * (consumer_id, member_id). The baseline is the trait-level reference
 * point that member-facing surfaces compare against to compute
 * "delta from your usual" state observations.
 *
 * Triggered by Vercel cron per `baseline_cadence_cron` in
 * `eidos_construct_settings` (default '0 6 1 * *' = monthly on the 1st
 * at 06:00 UTC).
 *
 * ## Math
 *
 * Per sub-measure, computed across observations whose sub-measure is
 * non-null (i.e. observations whose confidence was high enough to
 * report a real number):
 *
 *   - **centroid_hour** — circular mean (re-uses circularMeanHour).
 *     stddev: null for v1; proper circular stddev (sigma = sqrt(-2*ln R̄),
 *     where R̄ is the mean resultant length, scaled to hours) deferred.
 *   - **regularity_entropy** — arithmetic mean + sample stddev. Linear
 *     in [0, 1], so ordinary statistics are correct.
 *   - **night_load_fraction** — arithmetic mean + sample stddev. Same
 *     reasoning.
 *   - **social_jet_lag_hours** — arithmetic mean across the small
 *     range. Stddev not stored per the schema.
 *
 * ## Minimum
 *
 * A baseline requires at least 3 observations within the baseline
 * window. Fewer than that, the math isn't meaningful (a "trait" needs
 * variation across time to mean anything) and we skip the member.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_OBSERVATIONS_FOR_BASELINE = 3;

interface CircadianSetting {
  consumer_id: string;
  baseline_window_days: number;
}

interface ObservationRow {
  member_id: string;
  centroid_hour: number | null;
  regularity_entropy: number | null;
  night_load_fraction: number | null;
  social_jet_lag_hours: number | null;
}

interface PerMemberOutcome {
  consumer_id: string;
  member_id: string;
  outcome:
    | { kind: "written"; observation_count: number }
    | { kind: "skipped"; reason: string; observation_count: number }
    | { kind: "error"; reason: string };
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────
  // See compute-circadian route header for the CRON_SECRET / EIDOS_CRON_SECRET
  // dual-acceptance rationale.
  const cronSecret = process.env.CRON_SECRET;
  const eidosCronSecret = process.env.EIDOS_CRON_SECRET;
  if (!cronSecret && !eidosCronSecret) {
    return NextResponse.json(
      { error: "cron_secret_unset" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const acceptable = [cronSecret, eidosCronSecret]
    .filter((s): s is string => Boolean(s))
    .map((s) => `Bearer ${s}`);
  if (!acceptable.includes(auth)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const now = new Date();

  // ── Read enabled circadian settings ──────────────────────────────
  const { data: settings, error: settingsError } = await supabase
    .from("eidos_construct_settings")
    .select("consumer_id, baseline_window_days")
    .eq("construct", "circadian")
    .eq("enabled", true);

  if (settingsError) {
    return NextResponse.json(
      { error: "settings_read_failed", detail: settingsError.message },
      { status: 500 },
    );
  }

  if (!settings || settings.length === 0) {
    return NextResponse.json({
      summary: { consumers_processed: 0, baselines_written: 0, errors: 0 },
      detail: [],
      note: "No enabled circadian settings rows.",
    });
  }

  const outcomes: PerMemberOutcome[] = [];

  for (const s of settings as CircadianSetting[]) {
    const windowMs = s.baseline_window_days * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now.getTime() - windowMs);

    // Pull every observation within the window, partitioned per member.
    const { data: observations, error: obsError } = await supabase
      .from("eidos_circadian_observations")
      .select(
        "member_id, centroid_hour, regularity_entropy, night_load_fraction, social_jet_lag_hours",
      )
      .eq("consumer_id", s.consumer_id)
      .gte("computed_at", windowStart.toISOString())
      .lte("computed_at", now.toISOString());

    if (obsError) {
      outcomes.push({
        consumer_id: s.consumer_id,
        member_id: "*",
        outcome: { kind: "error", reason: `obs_read_failed: ${obsError.message}` },
      });
      continue;
    }

    // Group by member
    const byMember = new Map<string, ObservationRow[]>();
    for (const row of (observations ?? []) as ObservationRow[]) {
      const list = byMember.get(row.member_id) ?? [];
      list.push(row);
      byMember.set(row.member_id, list);
    }

    for (const [memberId, rows] of byMember.entries()) {
      const outcome = await baselineForMember({
        supabase,
        consumerId: s.consumer_id,
        memberId,
        observations: rows,
        windowDays: s.baseline_window_days,
      });
      outcomes.push({
        consumer_id: s.consumer_id,
        member_id: memberId,
        outcome,
      });
    }
  }

  const baselinesWritten = outcomes.filter(
    (o) => o.outcome.kind === "written",
  ).length;
  const skipped = outcomes.filter((o) => o.outcome.kind === "skipped").length;
  const errors = outcomes.filter((o) => o.outcome.kind === "error").length;

  return NextResponse.json({
    summary: {
      consumers_processed: settings.length,
      members_processed: outcomes.length,
      baselines_written: baselinesWritten,
      skipped,
      errors,
    },
    detail: outcomes,
  });
}

async function baselineForMember(args: {
  supabase: ReturnType<typeof getServiceClient>;
  consumerId: string;
  memberId: string;
  observations: ObservationRow[];
  windowDays: number;
}): Promise<PerMemberOutcome["outcome"]> {
  const { supabase, consumerId, memberId, observations, windowDays } = args;
  const n = observations.length;

  if (n < MIN_OBSERVATIONS_FOR_BASELINE) {
    return {
      kind: "skipped",
      reason: `below_minimum (${n} < ${MIN_OBSERVATIONS_FOR_BASELINE})`,
      observation_count: n,
    };
  }

  // Filter nulls per-column — observations below their construct
  // threshold null-out their sub-measures.
  const centroidHours = observations
    .map((o) => o.centroid_hour)
    .filter((v): v is number => v !== null);
  const regularities = observations
    .map((o) => o.regularity_entropy)
    .filter((v): v is number => v !== null);
  const nightLoads = observations
    .map((o) => o.night_load_fraction)
    .filter((v): v is number => v !== null);
  const jetLags = observations
    .map((o) => o.social_jet_lag_hours)
    .filter((v): v is number => v !== null);

  const traitCentroidHour = circularMeanHour(centroidHours);
  const traitRegularity = mean(regularities);
  const traitRegularityStddev = sampleStddev(regularities);
  const traitNightLoad = mean(nightLoads);
  const traitNightLoadStddev = sampleStddev(nightLoads);
  const traitJetLag = mean(jetLags);

  const { error: upsertError } = await supabase
    .from("eidos_circadian_baselines")
    .upsert(
      {
        member_id: memberId,
        consumer_id: consumerId,
        trait_centroid_hour: traitCentroidHour,
        // Circular stddev for centroid deferred — see file header.
        trait_centroid_hour_stddev: null,
        trait_regularity_entropy: traitRegularity,
        trait_regularity_entropy_stddev: traitRegularityStddev,
        trait_night_load_fraction: traitNightLoad,
        trait_night_load_fraction_stddev: traitNightLoadStddev,
        trait_social_jet_lag_hours: traitJetLag,
        sample_size: n,
        window_days: windowDays,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "member_id,consumer_id" },
    );

  if (upsertError) {
    return {
      kind: "error",
      reason: `upsert_failed: ${upsertError.message}`,
    };
  }

  return { kind: "written", observation_count: n };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Sample standard deviation (N-1 denominator). Returns null for n<2;
 * a single value has no spread.
 */
function sampleStddev(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;
  const m = mean(values)!;
  const sumSq = values.reduce((acc, x) => acc + (x - m) * (x - m), 0);
  return Math.sqrt(sumSq / (n - 1));
}
