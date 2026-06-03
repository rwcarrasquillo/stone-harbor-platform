import { NextResponse } from "next/server";
import { requireUser, serviceClient, err } from "../_helpers";
import { initSession } from "@/lib/eidos";

/**
 * POST /api/map/begin
 *
 * Initialize an Eidos session for the caller if one does not already
 * exist. Idempotent — calling this when a session already exists
 * returns the existing state rather than overwriting.
 *
 * After this call the user is at week 1, module 1.1, status
 * in_progress. The /map UI then renders Module 1.1.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const svc = serviceClient();

  // Already started?
  const { data: existing, error: lookupErr } = await svc
    .from("eidos_sessions")
    .select("user_id, current_week, current_module_id, status")
    .eq("user_id", gate.userId)
    .maybeSingle();
  if (lookupErr) return err(500, "lookup_failed", lookupErr.message);
  if (existing) {
    return NextResponse.json({ session: existing, alreadyExisted: true });
  }

  // Create a fresh session via the engine's pure init function.
  const state = initSession(gate.userId);

  const { error: insertErr } = await svc.from("eidos_sessions").insert({
    user_id: state.userId,
    current_week: state.currentWeek,
    current_module_id: state.currentModuleId,
    status: state.status,
    started_at: state.startedAt,
    last_active_at: state.lastActiveAt,
  });
  if (insertErr) return err(500, "insert_failed", insertErr.message);

  return NextResponse.json({ session: state, alreadyExisted: false });
}
