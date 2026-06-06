/**
 * POST /api/settle-in/skip — server-side write of
 * `profiles.settle_in_skipped_at` for the authenticated user.
 *
 * Mirror of /api/settle-in/complete; same architectural rationale.
 * The "Skip" affordance on the settle-in flow needs the same
 * reliability as the "Step into the Harbor" CTA — a silently-failed
 * write would leave the member looping back to /settle-in on every
 * page navigation.
 *
 * Linear: SH-25.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  const admin = adminClient();
  if (!admin) {
    return err(500, "server_misconfigured", "Settle-in service is temporarily unavailable.");
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ settle_in_skipped_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateErr) {
    console.error("/api/settle-in/skip UPDATE failed", {
      userId,
      code: updateErr.code,
      message: updateErr.message,
    });
    return err(500, "update_failed", "We couldn't record your choice. Please try again.");
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
