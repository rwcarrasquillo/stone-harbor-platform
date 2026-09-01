/**
 * Stone Harbor — /practice helpers (SH-134, PR 1 foundation).
 *
 * Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Practice_Surface_Design.md
 *
 * /practice is the routine-scaffold answer to the founder-identified
 * gap: routine is load-bearing in recovery from divorce, grief and
 * depression, and the harbor's existing partial answers (Strength 2,
 * Small Things, TodayIntention) all assume a man who is already
 * walking. /practice meets one who isn't. He names a shape once —
 * three optional blocks, his own words — and the harbor carries it.
 *
 * The line this module must not cross is scaffold vs chase (brief §3).
 * Nothing here schedules, reminds, scores or counts. `last_seen_at` is
 * ONE mutable timestamp, not a visit log; it exists so PR 2 can meet a
 * returning man where he is, never so the harbor can go after him.
 *
 * PR 1 (this ship): schema + landing view.
 * PR 2: dashboard integration (time-of-day card + return card).
 * PR 3: reflection band + body-first entry.
 *
 * Every helper takes the caller's Supabase client, same contract as
 * lib/spine.ts, so the module serves browser surfaces (the anon client
 * from lib/supabaseClient) and any future server route alike. Reads are
 * deliberately forgiving — a failed query degrades to "no shape" rather
 * than costing the member the surface they came for.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The member's declared shape, as stored in `profiles.practice_shape`.
 *
 * All three blocks are optional in spirit — the member may name one,
 * two or all three — but they are always PRESENT as strings, empty
 * when unnamed, so callers never branch on undefined. "Declared" is a
 * question for {@link hasDeclaredShape}, not for the type.
 */
export type PracticeShape = {
  morning_anchor: string;
  midday_touch: string;
  evening_close: string;
  /** ISO. Set once, on the first save. Never rewritten. */
  declared_at: string;
  /** ISO. Rewritten on every save, including single-block edits. */
  last_reshape_at: string;
};

/** The three blocks, in the order the day runs. */
export const PRACTICE_BLOCK_KEYS = [
  "morning_anchor",
  "midday_touch",
  "evening_close",
] as const;

export type PracticeBlockKey = (typeof PRACTICE_BLOCK_KEYS)[number];

/**
 * Days of absence before PR 2 offers the "your shape is here" return
 * card. Five, per brief §14.4 — short enough to catch real drift, long
 * enough that a regular member never sees it.
 *
 * Defined here rather than in PR 2's component so the threshold has one
 * home from the moment the column that feeds it exists.
 */
export const PRACTICE_ABSENCE_THRESHOLD_DAYS = 5;

/**
 * Debounce window for `last_seen_at` writes. Without it, every page
 * navigation on an authenticated surface is an UPDATE on profiles —
 * write amplification for a value whose only consumer asks a
 * five-DAY question.
 */
export const PRACTICE_LAST_SEEN_DEBOUNCE_MINUTES = 5;

/**
 * Read the practice feature flag from app_settings (singleton id=1).
 * Defaults false on error — safe fallback keeps today's behavior.
 *
 * Mirrors getSpineEnabled / the keepers + eidos flag readers.
 */
export async function getPracticeEnabled(
  client: SupabaseClient,
): Promise<boolean> {
  try {
    const { data } = await client
      .from("app_settings")
      .select("practice_enabled")
      .eq("id", 1)
      .maybeSingle();
    return !!data?.practice_enabled;
  } catch {
    return false;
  }
}

/**
 * Read the member's declared shape, or null when they've never
 * declared one (the column is NULL) or the read failed.
 *
 * Both cases collapse to null on purpose: the caller's question is
 * "is there a shape to render", and a failed read has the same honest
 * answer as an absent one.
 */
export async function getPracticeShape(
  client: SupabaseClient,
  userId: string,
): Promise<PracticeShape | null> {
  try {
    const { data } = await client
      .from("profiles")
      .select("practice_shape")
      .eq("id", userId)
      .maybeSingle();
    return (data?.practice_shape as PracticeShape | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * True when at least one block carries words.
 *
 * This — not the presence of the jsonb column — is what decides which
 * view /practice renders. A member who declares one block has a
 * practice; a member who saves three blanks does not, and gets the
 * onboarding view back rather than three empty cards. That is also
 * what makes "start fresh" (brief §14.5) work with no extra state:
 * clearing every block returns the surface to its beginning.
 */
export function hasDeclaredShape(shape: PracticeShape | null): boolean {
  if (!shape) return false;
  return PRACTICE_BLOCK_KEYS.some((key) => !!shape[key]?.trim());
}

/**
 * Write the member's shape. Serves both the first declaration from the
 * onboarding view and every later single-block edit.
 *
 * Merge semantics: any block the caller omits keeps its stored value,
 * so the inline Edit affordance can send one block without carrying
 * the other two. Values are trimmed on the way in, so a block of pure
 * whitespace reads as unnamed to {@link hasDeclaredShape} rather than
 * as a declared block that renders blank.
 *
 * `declared_at` is stamped once and preserved forever after;
 * `last_reshape_at` moves on every save. Prior shapes are NOT kept —
 * the current declaration is authoritative (brief §10, §12).
 *
 * Returns the persisted shape, or null if the write failed. Callers
 * that show the member their own words should render what comes back
 * rather than what they sent.
 */
export async function updatePracticeShape(
  client: SupabaseClient,
  userId: string,
  patch: Partial<Record<PracticeBlockKey, string>>,
): Promise<PracticeShape | null> {
  try {
    const existing = await getPracticeShape(client, userId);
    const now = new Date().toISOString();

    const resolve = (key: PracticeBlockKey): string =>
      (patch[key] ?? existing?.[key] ?? "").trim();

    const next: PracticeShape = {
      morning_anchor: resolve("morning_anchor"),
      midday_touch: resolve("midday_touch"),
      evening_close: resolve("evening_close"),
      declared_at: existing?.declared_at ?? now,
      last_reshape_at: now,
    };

    const { data, error } = await client
      .from("profiles")
      .update({ practice_shape: next })
      .eq("id", userId)
      .select("practice_shape")
      .maybeSingle();

    if (error) {
      console.error("[practice] failed to save shape:", error);
      return null;
    }

    return (data?.practice_shape as PracticeShape | null) ?? null;
  } catch (err) {
    console.error("[practice] failed to save shape:", err);
    return null;
  }
}

/**
 * Stamp `last_seen_at`, at most once per
 * {@link PRACTICE_LAST_SEEN_DEBOUNCE_MINUTES}.
 *
 * Fire-and-forget by contract: this never throws and never blocks a
 * render. A member whose presence stamp fails to write has lost
 * nothing he came for — at worst PR 2 offers him a return card a day
 * late. Returns true when a write happened, false when it was
 * debounced or failed, which is what makes the debounce testable
 * without faking the clock.
 *
 * Why here and not in middleware: middleware.ts does locale
 * canonicalization and zero auth work (verified — see its header and
 * the SH-113 ESLint rule's rationale), so it has no session to attach
 * a presence write to. Every gate in this app is client-side and
 * per-page, and so is this.
 */
export async function touchLastSeen(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await client
      .from("profiles")
      .select("last_seen_at")
      .eq("id", userId)
      .maybeSingle();

    const previous = data?.last_seen_at
      ? new Date(data.last_seen_at as string)
      : null;

    if (previous && !Number.isNaN(previous.getTime())) {
      const elapsedMs = Date.now() - previous.getTime();
      if (elapsedMs < PRACTICE_LAST_SEEN_DEBOUNCE_MINUTES * 60 * 1000) {
        return false;
      }
    }

    const { error } = await client
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      console.error("[practice] failed to stamp last_seen_at:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[practice] failed to stamp last_seen_at:", err);
    return false;
  }
}
