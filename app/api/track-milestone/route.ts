import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Stone Harbor — milestone tracking endpoint.
 *
 * POST /api/track-milestone
 * Authorization: Bearer <supabase access token>
 * Body: { milestone: string }
 *
 * Inserts one row into public.member_milestones. The UNIQUE
 * constraint on (member_id, milestone) makes this idempotent:
 * the client can call emit-milestone defensively from many
 * places and the database will only ever record the first one.
 */

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as
      | { milestone?: string }
      | null;
    if (!body || !body.milestone) return new NextResponse(null, { status: 204 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    // Idempotent insert via ON CONFLICT DO NOTHING semantics: the
    // UNIQUE (member_id, milestone) constraint will refuse the
    // duplicate; we swallow the error so the caller can't tell.
    await supabase.from("member_milestones").insert({
      member_id: user.id,
      milestone: body.milestone,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
