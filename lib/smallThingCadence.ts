/**
 * Stone Harbor — small-thing cadence.
 *
 * The "A small thing, if you'd like" dashboard tile appears on a
 * deterministic 3-of-7-days cadence per member. This module
 * exports the cadence helper as pure logic so it can be unit
 * tested without loading React, framer-motion, or the supabase
 * client. The SmallThing component imports it.
 *
 * Determinism:
 *   hash(userId + YYYY-MM-DD) mod 7 → slot 0..6. Slots {1, 3, 5}
 *   are "show" days. Three of seven (~43% of days), with at least
 *   one rest day between any two yes-days. Intentionally crude —
 *   we want predictable cadence, not perfect distribution.
 *
 * Preview-mode bypass:
 *   When a preview-day override is active, the cadence is bypassed
 *   and the tile always shows. This lets the founder verify the
 *   tile's rendering without waiting for a "yes" day.
 */

import { getPreviewDayOverride } from "@/lib/userProgress";

export function shouldShowSmallThingToday(userId: string): boolean {
  if (!userId) return false;

  // In preview mode, always show. The founder needs to be able to
  // verify the tile renders correctly without gambling on cadence.
  if (typeof window !== "undefined" && getPreviewDayOverride() !== null) {
    return true;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = userId + today;
  // Tiny deterministic 32-bit hash (djb2 variant). Cryptographic
  // strength is irrelevant — we just need stability per (user, day).
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  const slot = Math.abs(hash) % 7;
  return slot === 1 || slot === 3 || slot === 5;
}
