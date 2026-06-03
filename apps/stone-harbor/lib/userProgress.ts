/**
 * Stone Harbor — user progression helpers.
 *
 * The harbor reveals itself slowly. New practices appear only after
 * the member has established a basic rhythm. This file is the single
 * source of truth for "is this feature visible to this man yet?"
 *
 * Design philosophy:
 *   The man is not progressing through a course. He is settling into
 *   a place. New rooms appear when the place has had time to feel
 *   familiar. Day thresholds are intentional, not arbitrary — they
 *   give the man a month of patient quiet before anything new is
 *   added to his peripheral vision.
 *
 *   These thresholds are checked client-side using the profile's
 *   created_at timestamp. They are NOT a hard security boundary —
 *   any sufficiently motivated member could inspect the network and
 *   call the underlying API directly. That's fine. The thresholds
 *   exist to protect the experience of someone trusting the harbor
 *   to pace itself for them, not to prevent power-users from peeking.
 *
 * Adding a new gated feature:
 *   1. Add a constant to FEATURE_THRESHOLDS below.
 *   2. Read `isFeatureUnlocked(profile.created_at, FEATURE_THRESHOLDS.X)`
 *      wherever the feature renders.
 *   3. If the feature should never be gated (general UX improvements
 *      like the 5-second nudge), don't gate it at all — just render
 *      it unconditionally.
 */

/**
 * Day-thresholds for each progressive disclosure feature. The number
 * is days since the member's profile was created. A value of 0 means
 * "visible immediately."
 *
 * Tuning notes for product / clinical review:
 *   - 30 (body) chosen to give the man a full month of contemplative
 *     reflection before introducing a somatic dimension. Adding the
 *     body earlier risks the member feeling the app is a checklist
 *     of practices to perform.
 *   - 60 (vocabulary) chosen so the expanded mood granularity arrives
 *     after he has used the basic 6-mood picker enough times to feel
 *     the limit of it organically. Earlier and it's overwhelming;
 *     later and the data we collect remains too coarse.
 *   - 75 (small things) chosen to land 15 days after vocabulary so
 *     the man doesn't feel a wave of new features. Each addition
 *     gets a quiet beat to itself.
 *   - 90 (lineage) chosen for the heaviest emotional invitation,
 *     to ensure significant trust has accumulated first.
 *   - 120 (brotherhood pairing) chosen as the last unlock — peer
 *     accountability is the highest-anxiety feature.
 */
export const FEATURE_THRESHOLDS = {
  bodyCheck: 30,
  longExhale: 30,
  subMoods: 60,
  smallThings: 75,
  lineage: 90,
  brotherhoodPairing: 120,
} as const;

/**
 * Compute the number of whole days between `createdAt` and now.
 * Returns 0 for the first day, 1 the day after signup, etc.
 *
 * Implementation note:
 *   We use floor(diff / dayMs) rather than counting calendar days
 *   because the latter requires knowing the member's timezone, which
 *   we don't always have at the point of this check. The drift is
 *   at most a few hours — acceptable for a pacing mechanism.
 *
 * Preview override:
 *   When `?previewDay=N` is in the URL (or `stone-harbor-preview-day`
 *   is set in localStorage), this function returns N instead. This
 *   is the testing affordance that lets the founder step through how
 *   the harbor looks at day 30, 60, 75, etc., from a single live
 *   account — no need to create backdated test users.
 *
 *   It is intentionally NOT gated behind NODE_ENV. Anyone can spoof
 *   their preview day, but every gated feature degrades gracefully
 *   when shown to the wrong member, so this is harmless. The benefit
 *   of always-on is that the founder can preview on the deployed
 *   production site, not just locally.
 */
export function daysSinceSignup(createdAt: string | null | undefined): number {
  const override = getPreviewDayOverride();
  if (override !== null) return override;
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

const PREVIEW_DAY_STORAGE_KEY = "stone-harbor-preview-day";

/**
 * Read the active preview-day override. Returns null when no override
 * is in effect. The URL parameter takes precedence over localStorage
 * so a fresh link can always set or change the preview without first
 * clearing what was previously set.
 *
 * URL forms recognized:
 *   ?previewDay=30      — set override to 30 and persist to localStorage
 *   ?previewDay=clear   — explicit clear (also useful in bookmarks)
 *
 * Server-side calls (where window is undefined) return null. Components
 * that gate features on this will simply render the pre-feature version
 * during SSR, which is acceptable since the gated content is by
 * definition optional.
 */
export function getPreviewDayOverride(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("previewDay");
    if (raw !== null) {
      if (raw === "clear" || raw === "") {
        window.localStorage.removeItem(PREVIEW_DAY_STORAGE_KEY);
        return null;
      }
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        window.localStorage.setItem(PREVIEW_DAY_STORAGE_KEY, String(parsed));
        return parsed;
      }
    }
    const stored = window.localStorage.getItem(PREVIEW_DAY_STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    // localStorage may be unavailable (privacy mode, third-party
    // contexts). Silently fall through to "no override."
  }
  return null;
}

/**
 * Programmatically set the preview-day override. Used by the
 * PreviewDayBadge component when the founder clicks a day chip.
 * Pass null (or call clearPreviewDay) to exit preview mode.
 */
export function setPreviewDayOverride(day: number | null): void {
  if (typeof window === "undefined") return;
  try {
    if (day === null) {
      window.localStorage.removeItem(PREVIEW_DAY_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PREVIEW_DAY_STORAGE_KEY, String(day));
    }
  } catch {
    // Best-effort; no UI affordance for failure here.
  }
}

/**
 * Convenience helper to clear preview mode.
 */
export function clearPreviewDay(): void {
  setPreviewDayOverride(null);
}

/**
 * True if `daysSinceSignup(createdAt) >= threshold`.
 *
 * Use this in component render: `isFeatureUnlocked(profile.created_at, FEATURE_THRESHOLDS.bodyCheck)`.
 *
 * The default `createdAt` of null returns false — features stay
 * hidden if we don't know when the member joined. Safer to hide
 * a feature from a new member than to surface it prematurely.
 */
export function isFeatureUnlocked(
  createdAt: string | null | undefined,
  thresholdDays: number,
): boolean {
  return daysSinceSignup(createdAt) >= thresholdDays;
}
