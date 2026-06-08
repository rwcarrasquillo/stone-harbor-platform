import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Eidos Engine — service-role Supabase client (server only).
 *
 * Every server surface in Eidos runs with elevated privilege: the
 * /api/v1/events ingestion endpoint (EID-19), the per-construct cron
 * compute jobs (EID-20+), and the admin spot-check reads (EID-21).
 * The behavioral-inference tables have RLS enabled with NO permissive
 * policies — all access flows through this service-role client, which
 * performs its own consumer + member identity checks at the API layer.
 *
 * NEVER import this from a Client Component. The service-role key must
 * not reach the browser. Env vars are intentionally un-prefixed
 * (SUPABASE_*, not NEXT_PUBLIC_*) so they stay server-side.
 *
 * Targets the standalone Eidos Supabase project (xfsqytpitltfeacvmvqm,
 * "eidos-engine") — separate from Stone Harbor's prod DB.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }
  if (!SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!cached) {
    cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
