/**
 * Stone Harbor — fixed-window rate limiting for API routes (SH-161,
 * review finding 9).
 *
 * Counters live in `public.api_rate_limits`, incremented atomically by
 * the service-role-only `hit_rate_limit()` RPC, so limits hold across
 * every Vercel function instance. If the limiter itself errors we fail
 * OPEN (log and allow): a database blip should not lock members out of
 * registration or checkout.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitRule = {
  /** Logical bucket, e.g. "map.generate-chapter". */
  bucket: string;
  /** Max allowed calls per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  generateChapter: { bucket: "map.generate-chapter", limit: 5, windowSeconds: 3600 },
  registerIp: { bucket: "register.ip", limit: 5, windowSeconds: 3600 },
  registerEmail: { bucket: "register.email", limit: 3, windowSeconds: 3600 },
  checkout: { bucket: "checkout.session", limit: 10, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

/**
 * Record one hit for `subject` and report whether it's allowed.
 * Returns true when the call may proceed.
 */
export async function allowRequest(
  admin: SupabaseClient,
  rule: RateLimitRule,
  subject: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("hit_rate_limit", {
    p_bucket: rule.bucket,
    p_subject: subject,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    console.error(`[rateLimit] ${rule.bucket} limiter failed; allowing`, error.message);
    return true;
  }
  return data !== false;
}

/**
 * The caller's IP for anonymous limits. On Vercel, `x-real-ip` and the
 * first `x-forwarded-for` entry are set by the platform edge.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
