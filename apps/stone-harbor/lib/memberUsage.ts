"use client";

import { supabase } from "@/lib/supabaseClient";
import { featureForPath } from "@/lib/featureNames";

/**
 * Stone Harbor — member usage tracking (client side).
 *
 * Wraps the server's /api/track-view + /api/track-milestone
 * endpoints. Direct DB inserts moved server-side so we can
 * capture geographic context (country, region) from Vercel edge
 * headers without ever holding an IP address client-side.
 *
 * Privacy:
 *   - Only the URL pathname is sent. Query strings and hash
 *     fragments are stripped client-side, then again server-side.
 *   - Geo is country + region (state/province) at most — never
 *     city, never IP, never coordinates.
 *
 * Fire-and-forget:
 *   Every call here returns immediately. Errors are swallowed.
 *   The member experience must never wait on or surface
 *   analytics failures.
 *
 * The slug→brand mapping (Reflect / Vent / Brotherhood / Breathe)
 * lives in lib/featureNames.ts so it can be unit-tested without
 * loading React or the Supabase client.
 */

let lastTrackedPath: string | null = null;

async function authHeader(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : null;
  } catch {
    return null;
  }
}

/**
 * Track a member page view. Idempotent against the same path
 * within a single render cycle to avoid React strict-mode
 * double-counts.
 */
export function trackMemberPageView(
  path: string,
  referrer?: string | null,
): void {
  const cleanPath = path.split("?")[0].split("#")[0] || "/";
  if (cleanPath === lastTrackedPath) return;
  lastTrackedPath = cleanPath;

  void (async () => {
    try {
      const authz = await authHeader();
      if (!authz) return; // anonymous: not tracked
      await fetch("/api/track-view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authz,
        },
        body: JSON.stringify({
          path: cleanPath,
          feature: featureForPath(cleanPath),
          referrer: referrer ?? null,
        }),
        keepalive: true,
      });
    } catch {
      // Silent.
    }
  })();
}

/**
 * Record a healing-path milestone. Idempotent at the DB level
 * (UNIQUE on (member_id, milestone)), so calling this twice for
 * the same member+milestone is harmless.
 *
 * Canonical milestone names — keep these stable forever; renaming
 * loses historical roll-up:
 *   onboarding_complete
 *   first_journal_entry
 *   first_sub_mood
 *   first_small_thing_click
 *   first_lineage_entry
 *   first_brotherhood_pair
 *   first_vent_post
 *   first_breath_complete
 */
export function trackMilestone(milestone: string): void {
  void (async () => {
    try {
      const authz = await authHeader();
      if (!authz) return;
      await fetch("/api/track-milestone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authz,
        },
        body: JSON.stringify({ milestone }),
      });
    } catch {
      // Silent.
    }
  })();
}

/**
 * Record first-touch acquisition (utm + referrer + landed path).
 * Idempotent: server-side upsert keyed on member_id. Safe to call
 * from any post-auth code path; only the first successful call
 * counts.
 */
export function trackAcquisition(): void {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      const authz = await authHeader();
      if (!authz) return;
      const url = new URL(window.location.href);
      const utm = {
        utm_source: url.searchParams.get("utm_source"),
        utm_medium: url.searchParams.get("utm_medium"),
        utm_campaign: url.searchParams.get("utm_campaign"),
      };
      // If no utm AND no document.referrer, nothing meaningful to
      // record — skip. The page-view stream is still captured.
      if (
        !utm.utm_source &&
        !utm.utm_medium &&
        !utm.utm_campaign &&
        !document.referrer
      ) {
        return;
      }
      await fetch("/api/track-acquisition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authz,
        },
        body: JSON.stringify({
          ...utm,
          referrer: document.referrer || null,
          landed_path: url.pathname || "/",
        }),
      });
    } catch {
      // Silent.
    }
  })();
}
