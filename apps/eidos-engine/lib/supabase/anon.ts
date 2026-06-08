import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Eidos Engine — anon Supabase client.
 *
 * Stubbed for completeness. Eidos has no public, anon-readable surface
 * in this phase — the push-event ingestion endpoint authenticates with
 * a consumer bearer token (resolved to a consumer_id, see EID-19) and
 * the cron/admin surfaces use the service-role client. This exists so
 * that if a genuinely public, RLS-gated endpoint is ever added, the
 * wiring is already here rather than improvised inline.
 *
 * Env vars are un-prefixed (SUPABASE_*) to match the server client.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

export function getAnonClient(): SupabaseClient {
  if (!SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL");
  }
  if (!ANON_KEY) {
    throw new Error("Missing SUPABASE_ANON_KEY");
  }
  if (!cached) {
    cached = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
