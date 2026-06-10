import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { computeCircadian, type CircadianEvent } from "@/lib/circadian";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — Circadian observation cron (EID-20).
 *
 * GET /api/eidos/compute-circadian
 * Authorization: Bearer <EIDOS_CRON_SECRET>
 *
 * Iterates every enabled (construct='circadian', consumer_id) row in
 * eidos_construct_settings, finds every (consumer_id, member_id) tuple
 * that has produced journal.created events in the observation window,
 * runs the pure compute module, and inserts one row per member into
 * eidos_circadian_observations.
 *
 * Triggered by Vercel cron per the schedule in eidos_construct_settings
 * (`observation_cadence_cron`, default '0 6 * * 1' = Mondays 06:00 UTC).
 * Vercel reads `vercel.json::crons` for the actual schedule; this route
 * doesn't care when it's called as long as the auth bearer is valid.
 *
 * The compute module is pure (see lib/circadian.ts). This route owns
 * I/O: reading settings, reading events, deciding what window, writing
 * observations. Keep math out of this file — every line should be
 * either an I/O call, an auth/validation guard, or a small adapter
 * mapping DB rows to compute inputs and back.
 *
 * Response: 200 JSON summary suitable for logs and the eventual admin
 * cron-health dashboard. Errors per (consumer, member) are collected
 * and reported but never abort the whole run — one bad member
 * shouldn't lose the whole cohort's observations.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Timezone resolution. Per the architecture spec (§5), each host
 * pushes (or exposes) a per-member timezone via `profiles.timezone`.
 * SH-32 (settle-in opt-in) is the issue that adds that column. Until
 * SH-32 ships and Eidos has a way to read it cross-system, we hardcode
 * America/New_York for everything — fine while Rafael is the only
 * member, breaks the moment a member outside ET joins.
 *
 * When SH-32 lands: replace this with a lookup against a pulled
 * `eidos_member_metadata` table (or whatever shape the timezone-sync
 * issue ends up using). Marked as TODO in the issue tracker.
 */
function resolveTimezone(_consumerId: string, _memberId: string): string {
  return "America/New_York";
}

interface CircadianSetting {
  consumer_id: string;
  observation_window_days: number;
  min_sample_size: number;
  min_unique_days: number;
  full_confidence_sample_size: number;
  full_confidence_window_days: number;
}

interface PerMemberOutcome {
  consumer_id: string;
  member_id: string;
  outcome:
    | { kind: "written"; observation_id: string; sample_size: number; confidence: number }
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
  // Vercel cron auto-signs with Bearer ${CRON_SECRET} when that env
  // var is set. We also accept EIDOS_CRON_SECRET as a fallback so the
  // existing EID-17/EID-19 env setup keeps working for manual curls.
  // Both should ideally be set to the same value in production.
  const cronSecret = process.env.CRON_SECRET;
  const eidosCronSecret = process.env.EIDOS_CRON_SECRET;
  if (!cronSecret && !eidosCronSecret) {
    // Misconfiguration — fail loud so it surfaces in logs.
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
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = getServiceClient();
  const now = new Date();

  // ── Read enabled circadian settings ──────────────────────────────
  const { data: settings, error: settingsError } = await supabase
    .from("eidos_construct_settings")
    .select(
      "consumer_id, observation_window_days, min_sample_size, min_unique_days, full_confidence_sample_size, full_confidence_window_days",
    )
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
      summary: { consumers_processed: 0, observations_written: 0, errors: 0 },
      detail: [],
      note: "No enabled circadian settings rows.",
    });
  }

  // ── Per consumer: iterate members + compute ──────────────────────
  const outcomes: PerMemberOutcome[] = [];

  for (const s of settings as CircadianSetting[]) {
    const windowMs = s.observation_window_days * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now.getTime() - windowMs);

    // Distinct member_ids producing journal.created events in window
    const { data: memberRows, error: memberError } = await supabase
      .from("eidos_event_stream")
      .select("user_id")
      .eq("consumer_id", s.consumer_id)
      .eq("type", "journal.created")
      .gte("timestamp", windowStart.toISOString())
      .lte("timestamp", now.toISOString());

    if (memberError) {
      outcomes.push({
        consumer_id: s.consumer_id,
        member_id: "*",
        outcome: { kind: "error", reason: `member_query_failed: ${memberError.message}` },
      });
      continue;
    }

    const memberIds = Array.from(
      new Set((memberRows ?? []).map((r) => r.user_id as string)),
    );

    for (const memberId of memberIds) {
      const outcome = await computeForMember({
        supabase,
        setting: s,
        memberId,
        windowStart,
        windowEnd: now,
      });
      outcomes.push({
        consumer_id: s.consumer_id,
        member_id: memberId,
        outcome,
      });
    }
  }

  const observationsWritten = outcomes.filter(
    (o) => o.outcome.kind === "written",
  ).length;
  const errors = outcomes.filter((o) => o.outcome.kind === "error").length;

  return NextResponse.json({
    summary: {
      consumers_processed: settings.length,
      members_processed: outcomes.length,
      observations_written: observationsWritten,
      errors,
    },
    detail: outcomes,
  });
}

async function computeForMember(args: {
  supabase: ReturnType<typeof getServiceClient>;
  setting: CircadianSetting;
  memberId: string;
  windowStart: Date;
  windowEnd: Date;
}): Promise<PerMemberOutcome["outcome"]> {
  const { supabase, setting, memberId, windowStart, windowEnd } = args;

  // Pull this member's events in the window. The composite index
  // (consumer_id, user_id, timestamp DESC) makes this O(window).
  const { data: events, error: eventsError } = await supabase
    .from("eidos_event_stream")
    .select("event_id, timestamp")
    .eq("consumer_id", setting.consumer_id)
    .eq("user_id", memberId)
    .eq("type", "journal.created")
    .gte("timestamp", windowStart.toISOString())
    .lte("timestamp", windowEnd.toISOString())
    .order("timestamp", { ascending: true });

  if (eventsError) {
    return { kind: "error", reason: `events_read_failed: ${eventsError.message}` };
  }

  const circadianEvents: CircadianEvent[] = (events ?? []).map((e) => ({
    event_id: e.event_id as string,
    timestamp: e.timestamp as string,
  }));

  const output = computeCircadian({
    events: circadianEvents,
    ianaTimezone: resolveTimezone(setting.consumer_id, memberId),
    windowStart,
    windowEnd,
    minSampleSize: setting.min_sample_size,
    minUniqueDays: setting.min_unique_days,
    fullConfidenceSampleSize: setting.full_confidence_sample_size,
    fullConfidenceWindowDays: setting.full_confidence_window_days,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("eidos_circadian_observations")
    .insert({
      member_id: memberId,
      consumer_id: setting.consumer_id,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      sample_size: output.sample_size,
      unique_days: output.unique_days,
      centroid_hour: output.centroid_hour,
      regularity_entropy: output.regularity_entropy,
      night_load_fraction: output.night_load_fraction,
      social_jet_lag_hours: output.social_jet_lag_hours,
      confidence: output.confidence,
      evidence: output.evidence,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      kind: "error",
      reason: `insert_failed: ${insertError?.message ?? "unknown"}`,
    };
  }

  return {
    kind: "written",
    observation_id: inserted.id as string,
    sample_size: output.sample_size,
    confidence: output.confidence,
  };
}
