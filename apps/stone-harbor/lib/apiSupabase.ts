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
 * True when the member's profile is suspended (SH-161, review finding
 * 8). RLS already blocks a suspended member's direct table writes; API
 * routes that write through the service-role client call this so they
 * can't be used to route around that. A missing profile row reads as
 * not suspended.
 */
export async function isSuspended(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("suspended_at")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.suspended_at;
}

/** The production origin; the fallback for anything not on the allowlist. */
const CANONICAL_ORIGIN = "https://www.stoneharbor.app";

const PRODUCTION_ORIGINS = new Set([CANONICAL_ORIGIN, "https://stoneharbor.app"]);

/** This project's Vercel preview URLs (Vercel Authentication protects them). */
const PREVIEW_ORIGIN =
  /^https:\/\/stone-harbor-[a-z0-9-]+-rafael-carrasquillo-s-projects\.vercel\.app$/;

function isTrustedOrigin(origin: string): boolean {
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  if (process.env.VERCEL_ENV === "preview" && PREVIEW_ORIGIN.test(origin)) return true;
  if (process.env.NODE_ENV === "development" && /^http:\/\/localhost:\d+$/.test(origin)) {
    return true;
  }
  return false;
}

/**
 * The origin to build Stripe success/cancel/return URLs from (SH-160,
 * review finding 11). The browser's Origin header is used only when it's
 * on the allowlist (production domains, this project's previews in the
 * preview environment, localhost in dev); anything else, including a
 * spoofed Origin or forwarded host, falls back to the canonical origin.
 */
export function requestOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && isTrustedOrigin(origin)) return origin;
  return CANONICAL_ORIGIN;
}

/** Structured JSON error with a stable shape, mirroring existing routes. */
export function apiError(status: number, code: string, message?: string) {
  return Response.json(
    { ok: false, error: code, ...(message ? { message } : {}) },
    { status },
  );
}
