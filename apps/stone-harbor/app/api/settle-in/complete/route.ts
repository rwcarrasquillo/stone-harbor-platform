/**
 * POST /api/settle-in/complete — server-side write of
 * `profiles.settle_in_completed_at` for the authenticated user.
 *
 * Why server-side: the client-side `.update()` from settle-in's
 * `handleEnter` was silently failing for newly-confirmed members on
 * production. The RLS policies on `public.profiles` *should* allow the
 * write (RESTRICTIVE consumer_isolation + permissive `auth.uid()=id`
 * both pass when the row exists and the JWT is valid), but in practice
 * we lost the timestamp write often enough that members got stuck in
 * a settle-in loop. Same root-cause shape as SH-4 — and the same fix:
 * move the write to a server route using the service-role client.
 *
 * Pattern: lift the auth check to the anon client (reading the JWT
 * from the Authorization header), then perform the privileged write
 * with the admin client. Service role bypasses RLS, so the write is
 * deterministic.
 *
 * Linear: SH-25.
 *
 * SH-109 (spine Ship 1) extends the body with an optional
 * `currentStepId` — the Roadmap step the member picked on the Settle-In
 * "Where to begin" screen. When present it is validated against
 * roadmap_steps and written alongside the timestamp in the same UPDATE.
 * When absent (skip route, or `spine_enabled = false` so the picker
 * never rendered) the endpoint behaves exactly as it did before.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = { currentStepId?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // ---------- 1. Verify the caller's JWT ----------
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return err(401, "missing_token", "Missing or malformed Authorization header.");
  }

  const anon = anonClient();
  if (!anon) {
    return err(500, "server_misconfigured", "Settle-in service is temporarily unavailable.");
  }

  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return err(401, "invalid_token", "Your session has expired. Please sign in again.");
  }

  const userId = userData.user.id;

  // ---------- 2. Privileged write via service role ----------
  const admin = adminClient();
  if (!admin) {
    return err(500, "server_misconfigured", "Settle-in service is temporarily unavailable.");
  }

  // ---------- 3. Optional spine placement (SH-109) ----------
  // The picker only renders when `spine_enabled = true`, so most callers
  // send an empty body. Parsing is tolerant: a missing/unparseable body
  // is the pre-spine shape, not an error.
  const body = ((await req.json().catch(() => null)) ?? {}) as Body;
  const rawStepId = body.currentStepId;

  let currentStepId: string | null = null;
  if (rawStepId !== undefined && rawStepId !== null) {
    if (typeof rawStepId !== "string" || !UUID_RE.test(rawStepId.trim())) {
      return err(400, "invalid_step", "That starting step isn't one we know.");
    }
    const candidate = rawStepId.trim();
    // Existence check against roadmap_steps. One extra read, but it means
    // a future client bug (or hand-rolled API call) can never write a
    // dangling step reference onto a member's profile.
    const { data: stepRow, error: stepErr } = await admin
      .from("roadmap_steps")
      .select("id")
      .eq("id", candidate)
      .maybeSingle();
    if (stepErr) {
      console.error("/api/settle-in/complete step lookup failed", {
        userId,
        code: stepErr.code,
        message: stepErr.message,
      });
      return err(500, "update_failed", "We couldn't record your first step. Please try again.");
    }
    if (!stepRow) {
      return err(400, "invalid_step", "That starting step isn't one we know.");
    }
    currentStepId = candidate;
  }

  // The row was created server-side by /api/register. We only ever touch
  // settle_in_completed_at here — plus the spine columns when the member
  // chose a starting step. Everything else is left alone.
  const nowIso = new Date().toISOString();
  const updates: Record<string, string> = { settle_in_completed_at: nowIso };
  if (currentStepId) {
    updates.current_roadmap_step_id = currentStepId;
    updates.current_step_entered_at = nowIso;
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (updateErr) {
    // Service-role write should never fail except on a DB-level fault.
    // Log so we see it in production if it does happen.
    console.error("/api/settle-in/complete UPDATE failed", {
      userId,
      code: updateErr.code,
      message: updateErr.message,
    });
    return err(500, "update_failed", "We couldn't record your first step. Please try again.");
  }

  return NextResponse.json(
    currentStepId ? { ok: true, userId, currentStepId } : { ok: true, userId },
    { status: 200 },
  );
}

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: code, message }, { status });
}
