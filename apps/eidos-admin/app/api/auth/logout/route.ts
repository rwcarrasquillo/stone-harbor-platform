import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Eidos Admin — logout POST.
 *
 * Ends this browser's Supabase session (server-side, so the refresh token
 * stops working too) and bounces to /login?logged_out=1. POST (not GET) so
 * link-prefetchers can't accidentally log you out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login?logged_out=1", req.url), {
    status: 303,
  });
}
