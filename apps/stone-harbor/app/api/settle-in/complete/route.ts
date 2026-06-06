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
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

  // The row was created server-side by /api/register. We only ever
  // touch settle_in_completed_at here — leave everything else alone.
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ settle_in_completed_at: new Date().toISOString() })
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

  return NextResponse.json({ ok: true, userId }, { status: 200 });
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
