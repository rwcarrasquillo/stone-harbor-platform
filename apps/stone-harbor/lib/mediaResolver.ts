/**
 * Stone Harbor — media catalog resolver.
 *
 * Client-side helper that lets a page resolve its
 * backgrounds (or audio tracks) from the admin-managed
 * media_assets catalog instead of a hardcoded array. This is
 * Phase 2 of the media binding rollout — admins upload + tag
 * assets in /media (admin app), pages read them here.
 *
 * Usage:
 *
 *   const urls = await resolveMediaUrls("background", "dashboard");
 *   // urls is ["/nature/alpine-lake-...", ...] ordered by `position`.
 *
 *   <RotatingNatureBackdrop area="dashboard" images={FALLBACK_IMAGES} />
 *   //   ^^ the component handles the fetch + fallback internally.
 *
 * Why client-side instead of a server component? The member
 * app's authenticated pages are already overwhelmingly "use
 * client" components — converting them to server components
 * just to fetch backgrounds would be a sprawling refactor. A
 * tiny client fetch on mount is fine for ambient layers that
 * cross-fade anyway; the fallback list keeps the page non-
 * empty during the ~50ms before the resolver returns.
 *
 * RLS shape: the read policy added in
 * media_003_member_reads_and_dashboard_seed.sql lets ANY
 * caller (anon or authenticated) read rows where
 * `is_active = true AND deleted_at IS NULL`. So this
 * resolver works on public pages (login, start-here, etc.)
 * without needing an auth gate.
 */

import { supabase } from "@/lib/supabaseClient";

export type MediaKind = "background" | "audio" | "other";

/**
 * In-memory cache keyed by `${kind}::${area}`. Pages mount,
 * fetch, render — and a back-and-forth between routes
 * shouldn't hammer the DB. Cache lives for the lifetime of
 * the JS bundle; a hard reload picks up any catalog edits
 * the admin just made.
 */
const cache = new Map<string, string[]>();

function key(kind: MediaKind, area: string): string {
  return `${kind}::${area}`;
}

/**
 * Resolve the ordered list of public_url strings for a
 * (kind, area) pool. Returns an empty array if the resolver
 * can't reach the DB OR if no active rows exist — callers
 * should treat empty as "fall back to your hardcoded list."
 */
export async function resolveMediaUrls(
  kind: MediaKind,
  area: string,
): Promise<string[]> {
  const k = key(kind, area);
  const cached = cache.get(k);
  if (cached) return cached;

  // The select query mirrors media_assets_pool_idx
  // (kind, area, is_active, position) so the index covers it.
  // deleted_at IS NULL is added implicitly by the RLS policy
  // for non-admin readers; we add it here too so admins
  // (who can see deleted rows) still get only the active
  // subset.
  const { data, error } = await supabase
    .from("media_assets")
    .select("public_url, position")
    .eq("kind", kind)
    .eq("area", area)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error || !data) return [];

  const urls = data
    .map((r) => (r as { public_url: string }).public_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  cache.set(k, urls);
  return urls;
}

/**
 * Force-clear the cache for a (kind, area). Useful if you
 * just edited the catalog in the admin app and want the
 * member side to pick it up without a hard reload. Not used
 * automatically — call from a dev-mode utility or admin-side
 * post-save handler if needed.
 */
export function invalidateMediaCache(kind: MediaKind, area: string): void {
  cache.delete(key(kind, area));
}

/**
 * Clear the entire cache. Used by the page-level reload-on-
 * focus pattern: when the tab regains focus, blow the cache
 * so the next render reflects any catalog edits made in the
 * other window.
 */
export function clearMediaCache(): void {
  cache.clear();
}
