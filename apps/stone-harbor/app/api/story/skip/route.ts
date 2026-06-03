import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { DEFAULT_SKIP_COOLDOWN_DAYS } from "@/lib/story";

/**
 * Stone Harbor — POST /api/story/skip
 *
 * Marks a story invitation as skipped and applies the cooldown that
 * prevents the prompt from re-surfacing until snooze_until.
 *
 * Request shape:
 *   POST /api/story/skip
 *   Authorization: Bearer <supabase access token>
 *   Body: { invitation_id: string, cooldown_days?: number }
 *
 * Auth model:
 *   We mint a per-request supabase client bound to the caller's
 *   bearer. The UPDATE then runs under that identity and is filtered
 *   by the `member_story_invitations_update_own` RLS policy — a
 *   member can only ever skip their own invitations.
 *
 * Why a route at all (vs. client direct update):
 *   - Single place to validate cooldown bounds.
 *   - Single place to add audit/telemetry later without touching UI.
 *   - Lets the response also return what the surfacer would do next
 *     (deferred — for v1 the card recomputes on the client).
 *
 * Returns:
 *   204 No Content on success.
 *   401 if the caller has no valid session.
 *   400 if the body is malformed.
 */

export const runtime = "edge";

type SkipBody = {
  invitation_id?: unknown;
  cooldown_days?: unknown;
};

function clampCooldown(value: unknown): number {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return DEFAULT_SKIP_COOLDOWN_DAYS;
  // Hard bounds: 1..30 days. Beyond that smells like an attempt to
  // either spam (0) or quietly kill a prompt forever.
  return Math.max(1, Math.min(30, Math.floor(n)));
}

export async function POST(req: NextRequest) {
  let body: SkipBody;
  try {
    body = (await req.json()) as SkipBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const invitationId =
    typeof body.invitation_id === "string" ? body.invitation_id : null;
  if (!invitationId) {
    return NextResponse.json(
      { error: "invitation_id is required" },
      { status: 400 }
    );
  }
  const cooldownDays = clampCooldown(body.cooldown_days);

  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const snoozeUntil = new Date(
    Date.now() + cooldownDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from("member_story_invitations")
    .update({
      status: "skipped",
      responded_at: new Date().toISOString(),
      snooze_until: snoozeUntil,
    })
    .eq("id", invitationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
