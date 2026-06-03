import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Stone Harbor — member page-view tracking endpoint.
 *
 * Client (MemberUsageTracker) POSTs here on every route change:
 *
 *   POST /api/track-view
 *   Authorization: Bearer <supabase access token>
 *   Body: { path: string, feature?: string, referrer?: string | null }
 *
 * Why a server route (vs. direct client insert):
 *   We need geographic context — country and region — and the
 *   only privacy-respecting way to get that is from edge headers
 *   the platform (Vercel) attaches to the request before our
 *   code runs. The client has no equivalent. By moving the write
 *   here we also stop exposing the table schema to the browser.
 *
 * Geo capture:
 *   We read `x-vercel-ip-country` and `x-vercel-ip-country-region`.
 *   We do NOT read or store IP, city, or coordinates. In local
 *   dev these headers are absent and both columns are stored as
 *   null — the analytics page surfaces "unknown" for those rows.
 *
 * Auth model:
 *   We do NOT use the service role key. We mint a per-request
 *   Supabase client using the caller's access token, so the
 *   member_page_views INSERT runs under their identity and is
 *   subject to the same RLS policy as a direct client write
 *   would have been. An attacker can only ever insert rows for
 *   themselves.
 *
 * Failure mode:
 *   Returns 204 on success and on benign failures (no auth,
 *   missing fields). The client treats this endpoint as fire-
 *   and-forget; we never want analytics to surface errors to a
 *   user trying to navigate the app.
 */

export const runtime = "edge"; // Vercel geo headers are populated at the edge.

/**
 * Local-dev geo fallback.
 *
 * On Vercel the edge headers (`x-vercel-ip-country` etc.) are set
 * for every request and our analytics gets country/region for
 * free. In local dev those headers are absent and country would
 * always come through as null — which makes it impossible to QA
 * the geography section of the analytics page until you deploy.
 *
 * To unblock that, when we detect we're not in production AND
 * the Vercel headers are missing, we do ONE call to ipapi.co
 * (free, no key required) and cache the result for the process
 * lifetime. The dev server's external IP gets resolved to a
 * country/region — which is effectively "your" location, since
 * the dev server runs on your machine.
 *
 * The fallback is gated on NODE_ENV !== "production" so a real
 * prod deploy never makes this third-party call.
 */
let cachedDevGeo: { country: string | null; region: string | null } | null =
  null;

async function getDevGeoFallback(): Promise<{
  country: string | null;
  region: string | null;
}> {
  if (cachedDevGeo) return cachedDevGeo;
  try {
    const res = await fetch("https://ipapi.co/json/", {
      // Don't let a slow lookup hold up the analytics write.
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!res.ok) {
      cachedDevGeo = { country: null, region: null };
      return cachedDevGeo;
    }
    const data = (await res.json()) as {
      country_code?: string;
      region_code?: string;
      region?: string;
    };
    cachedDevGeo = {
      country: data.country_code ?? null,
      region: data.region_code ?? data.region ?? null,
    };
    return cachedDevGeo;
  } catch {
    cachedDevGeo = { country: null, region: null };
    return cachedDevGeo;
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as
      | { path?: string; feature?: string | null; referrer?: string | null }
      | null;
    if (!body || !body.path) return new NextResponse(null, { status: 204 });

    // Drop query string and fragment defensively. The client also
    // strips, but we double-check here so a future client bug
    // can't sneak debug params into analytics.
    const cleanPath = body.path.split("?")[0].split("#")[0] || "/";

    // Geo from edge headers. Vercel sets these in production.
    let country = req.headers.get("x-vercel-ip-country") ?? null;
    let region =
      req.headers.get("x-vercel-ip-country-region") ??
      req.headers.get("x-vercel-ip-region") ??
      null;

    // Local dev only: if Vercel headers are absent and we're not
    // in production, do one cached lookup against ipapi.co so the
    // analytics UI can be QA'd without deploying.
    if (!country && process.env.NODE_ENV !== "production") {
      const fallback = await getDevGeoFallback();
      country = fallback.country;
      region = fallback.region;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!supabaseUrl || !supabaseAnonKey) {
      return new NextResponse(null, { status: 204 });
    }

    // Per-request client carrying the user's bearer. RLS will
    // confirm member_id matches auth.uid().
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    await supabase.from("member_page_views").insert({
      member_id: user.id,
      path: cleanPath,
      feature: body.feature ?? null,
      referrer: body.referrer ?? null,
      country,
      region,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Silent — analytics writes must never bubble errors back to
    // the browser. The dashboard simply shows fewer rows.
    return new NextResponse(null, { status: 204 });
  }
}
