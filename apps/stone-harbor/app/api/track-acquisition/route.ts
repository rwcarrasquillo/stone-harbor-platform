import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Stone Harbor — acquisition (first-touch) tracking endpoint.
 *
 * POST /api/track-acquisition
 * Authorization: Bearer <supabase access token>
 * Body: { utm_source, utm_medium, utm_campaign, referrer, landed_path }
 *
 * Upserts one row into public.member_acquisitions, keyed on
 * member_id. Subsequent calls are no-ops because we only INSERT
 * with ON CONFLICT (member_id) DO NOTHING semantics (enforced
 * by the PK + ignored conflict).
 *
 * Records:
 *   - utm_source / medium / campaign — campaign attribution
 *   - referrer  — original off-site referrer at landing
 *   - landed_path — first URL they hit on stoneharbor.app
 *   - landed_at — server time of first registered touch
 */

export const runtime = "edge";

type Body = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  landed_path?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return new NextResponse(null, { status: 204 });

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

    // First-touch only: if a row already exists for this member we
    // leave it alone. The PK on member_id makes this a clean
    // INSERT ... ON CONFLICT DO NOTHING.
    await supabase.from("member_acquisitions").insert({
      member_id: user.id,
      utm_source: body.utm_source ?? null,
      utm_medium: body.utm_medium ?? null,
      utm_campaign: body.utm_campaign ?? null,
      referrer: body.referrer ?? null,
      landed_path: body.landed_path ?? null,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
