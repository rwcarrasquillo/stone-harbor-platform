/**
 * Stone Harbor — shared server-side Supabase helpers for API routes
 * (SH-108 and onward).
 *
 * The app authenticates the browser with @supabase/supabase-js, whose
 * session lives in localStorage — NOT in cookies. So server route
 * handlers can't read the session from the request cookie jar the way
 * an @supabase/ssr app would. Instead they follow the established
 * pattern (see app/api/settle-in/complete/route.ts, SH-25):
 *
 *   1. The client sends its access token in `Authorization: Bearer …`.
 *   2. The route verifies it with the ANON client (`getUser(token)`).
 *   3. Privileged writes go through the SERVICE-ROLE client, which
 *      bypasses RLS so the write is deterministic.
 *
 * These three helpers are extracted here so the five Keepers routes
 * (and future routes) don't each re-declare them.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Anon client — used to verify a caller's JWT. Null if misconfigured. */
export function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client — privileged writes, bypasses RLS. Null if misconfigured. */
export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type BearerUser = { id: string; email: string | null };

/**
 * Resolve the caller from the `Authorization: Bearer <token>` header.
 *
 * Returns the user when the token is valid, or null when the header is
 * missing/malformed/expired. Callers that allow anonymous access treat
 * null as "not signed in"; callers that require auth return 401.
 */
export async function getBearerUser(
  req: Request,
): Promise<BearerUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const anon = anonClient();
  if (!anon) return null;

  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * The app's public origin, derived from the incoming request. Prefer
 * the browser-sent Origin header; fall back to the forwarded host, then
 * to the request URL. Used to build Stripe success/cancel/return URLs.
 */
export function requestOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

/** Structured JSON error with a stable shape, mirroring existing routes. */
export function apiError(status: number, code: string, message?: string) {
  return Response.json(
    { ok: false, error: code, ...(message ? { message } : {}) },
    { status },
  );
}
