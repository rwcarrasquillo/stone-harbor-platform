import { NextResponse } from "next/server";
import { requireUser, serviceClient, err } from "../_helpers";
import {
  scoreModule,
  aggregateLayers,
  advanceModule,
  evaluateSafety,
  type InstrumentId,
} from "@/lib/eidos";

/**
 * POST /api/map/respond
 *
 * Submit a complete set of responses for one module / one instrument.
 * The server:
 *   1. Authenticates the caller.
 *   2. Persists every response to eidos_responses (idempotent on
 *      (user_id, instrument_id, item_id) — re-submission overwrites).
 *   3. Scores the instrument via lib/eidos.
 *   4. Aggregates into the appropriate layer and upserts
 *      eidos_layer_scores.
 *   5. Runs evaluateSafety() across all of the caller's responses
 *      and writes an eidos_safety_events row if the level is
 *      anything but "none."
 *   6. Advances the session state machine to the next module.
 *
 * Body:
 *   {
 *     instrumentId: "bfi10" | "schwartz" | "bpnsfs12" | "phq2gad2",
 *     responses: [{ itemId, value }, ...]
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  instrumentId?: InstrumentId;
  responses?: Array<{ itemId: string; value: unknown }>;
};

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.instrumentId || !Array.isArray(body.responses)) {
    return err(400, "bad_request", "instrumentId and responses are required.");
  }

  const svc = serviceClient();
  const now = new Date().toISOString();

  // 1) Persist raw responses (idempotent via the unique constraint).
  const rows = body.responses.map((r) => ({
    user_id: gate.userId,
    instrument_id: body.instrumentId,
    item_id: r.itemId,
    value: r.value as never, // jsonb accepts anything serialisable
    responded_at: now,
  }));
  if (rows.length > 0) {
    const { error: upErr } = await svc
      .from("eidos_responses")
      .upsert(rows, { onConflict: "user_id,instrument_id,item_id" });
    if (upErr) return err(500, "responses_persist_failed", upErr.message);
  }

  // 2) Score the instrument. If the engine raises (e.g. incomplete
  // responses on a required instrument), surface the error to the
  // caller so the UI can prompt the user to finish.
  let result;
  try {
    result = scoreModule(body.instrumentId, body.responses);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scoring failed";
    return err(400, "scoring_failed", msg);
  }

  // 3) Aggregate into a layer row and upsert.
  const layerRows = aggregateLayers(gate.userId, [result]);
  for (const row of layerRows) {
    const { error: layerErr } = await svc
      .from("eidos_layer_scores")
      .upsert(
        {
          user_id: row.userId,
          layer: row.layer,
          scores: row.scores,
          computed_at: row.computedAt,
        },
        { onConflict: "user_id,layer" },
      );
    if (layerErr) return err(500, "layer_persist_failed", layerErr.message);
  }

  // 4) Safety eval across ALL of the caller's responses (not just
  // this submission). Pulling the full set keeps the eval consistent
  // even when modules are completed out of order.
  const { data: allResponses } = await svc
    .from("eidos_responses")
    .select("instrument_id, item_id, value")
    .eq("user_id", gate.userId);

  const safety = evaluateSafety(
    (allResponses ?? []).map((r) => ({
      instrumentId: r.instrument_id as InstrumentId,
      itemId: r.item_id,
      value: r.value,
    })),
  );

  if (safety.level !== "none") {
    await svc.from("eidos_safety_events").insert({
      user_id: gate.userId,
      level: safety.level,
      signals: safety.signals,
      context: {
        instrumentId: body.instrumentId,
        currentModuleId: body.instrumentId, // for now; later we'll pass module_id explicitly
      },
    });
  }

  // 5) Advance the session.
  const { data: session } = await svc
    .from("eidos_sessions")
    .select("user_id, current_week, current_module_id, status, started_at, last_active_at")
    .eq("user_id", gate.userId)
    .maybeSingle();

  if (session) {
    const next = advanceModule({
      userId: session.user_id,
      currentWeek: session.current_week,
      currentModuleId: session.current_module_id,
      status: session.status as never,
      startedAt: session.started_at,
      lastActiveAt: session.last_active_at,
    });

    await svc
      .from("eidos_sessions")
      .update({
        current_week: next.currentWeek,
        current_module_id: next.currentModuleId,
        status: next.status,
        last_active_at: next.lastActiveAt,
      })
      .eq("user_id", gate.userId);
  }

  return NextResponse.json({
    ok: true,
    scored: result,
    safety,
  });
}
