"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import { serif } from "@/lib/fonts";
// Re-export the cadence helper from its pure-logic module so the
// existing dashboard import (`import { shouldShowSmallThingToday }
// from "@/app/components/smallThing"`) keeps working. The split
// exists so the cadence logic can be unit tested without loading
// React.
export { shouldShowSmallThingToday } from "@/lib/smallThingCadence";

/**
 * Stone Harbor — SmallThing.
 *
 * The "A small thing, if you'd like" tile. Surfaces a brief brave
 * action 2-3 times per week as part of the dashboard rotation. The
 * harbor's behavioral activation channel — turning reflection into
 * action without ever calling it a challenge or a streak.
 *
 * Design rules baked in (these are constraints, not preferences):
 *
 *   1. No "I did it" button. The harbor offers; the man decides; the
 *      harbor doesn't track obedience. Acknowledging completion would
 *      collapse the offer into a task.
 *
 *   2. No streak counter for this action. The reflection streak that
 *      exists elsewhere is the only streak. Adding more streaks turns
 *      the harbor into a chore wheel.
 *
 *   3. Not every day. The parent decides display cadence — typically
 *      2-3 times per week, never on consecutive days. A daily small
 *      thing would feel like obligation. An occasional small thing
 *      feels like an offer.
 *
 *   4. Items rotate. We avoid showing the same small thing twice
 *      within a 30-day window via user_small_things. If we've shown
 *      him everything, we start over.
 *
 *   5. The man can refresh to a different one if the current one
 *      doesn't land — but the refresh is a tiny secondary action, not
 *      a prominent button. Friction-free decline is more important
 *      than friction-free engagement.
 *
 * Performance:
 *   The fetch runs once on mount and caches the selected small thing
 *   in component state. No interval, no re-fetch on focus — the
 *   rotation decision (which item to show) happens once per page
 *   load, not continuously.
 */

type SmallThingRow = {
  id: string;
  text: string;
  category: string;
};

type Props = {
  /** The current member's user id, needed to record last_shown_at. */
  userId: string;
};

export function SmallThing({ userId }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [item, setItem] = useState<SmallThingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Pick a small thing for this member, preferring items he hasn't
   * been shown recently (or ever). Strategy:
   *   1. Load his recent user_small_things rows (last 30 days).
   *   2. Load all active small things.
   *   3. Filter active items by "not in recent" set; if empty, fall
   *      back to "not seen in the last 14 days"; if still empty, fall
   *      back to anything.
   *   4. Pick one at random and record the showing.
   */
  async function pickSmallThing(excludeId?: string) {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const [{ data: history }, { data: pool }] = await Promise.all([
      supabase
        .from("user_small_things")
        .select("small_thing_id, last_shown_at")
        .eq("user_id", userId)
        .gte("last_shown_at", thirtyDaysAgo),
      supabase
        .from("small_things")
        .select("id, text, category")
        .eq("is_active", true),
    ]);

    if (!pool || pool.length === 0) {
      setItem(null);
      return;
    }

    const recentIds = new Set(
      (history ?? []).map((h) => h.small_thing_id as string),
    );
    let candidates = pool.filter(
      (p) => !recentIds.has(p.id) && p.id !== excludeId,
    );
    if (candidates.length === 0) {
      // Fall back to anything in pool (still excluding the one we're
      // refreshing from, if any).
      candidates = pool.filter((p) => p.id !== excludeId);
    }
    if (candidates.length === 0) {
      // Only one item in the entire active library — just show it.
      candidates = pool;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setItem(chosen as SmallThingRow);

    // Record that we've shown this one. Upsert so the same item showing
    // again just updates the timestamp.
    await supabase.from("user_small_things").upsert(
      {
        user_id: userId,
        small_thing_id: chosen.id,
        last_shown_at: new Date().toISOString(),
      },
      { onConflict: "user_id,small_thing_id" },
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await pickSmallThing();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handleRefresh() {
    setRefreshing(true);
    await pickSmallThing(item?.id);
    setRefreshing(false);
  }

  if (loading || !item) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`relative overflow-hidden border p-6 text-center backdrop-blur-md md:p-8 ${
        isDusk
          ? "border-white/10 bg-black/35"
          : "border-[var(--sh-border-subtle)] bg-white/70"
      }`}
      aria-label="A small thing for today"
    >
      {/* Quiet category eyebrow */}
      <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
        A small thing, if you&apos;d like
      </p>

      <p
        className={`${serif.className} mx-auto mt-3 max-w-xl text-xl italic leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
      >
        {item.text}
      </p>

      {/* Below: a single tertiary refresh affordance. No "I did it" CTA.
          No streak counter. The man closes the app and either does it
          or doesn't, and the harbor never asks. The pressure-free
          status line sits on the left only on wider viewports; on
          mobile we hide it so the "Another" link is centered alone. */}
      <div className="mt-6 flex items-center justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.28em] sm:justify-between">
        <span className="hidden text-[var(--sh-text-tertiary)] sm:inline">
          No pressure. No reminder.
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50"
          aria-label="Show me a different one"
        >
          {refreshing ? "…" : "Another"}
        </button>
      </div>
    </motion.div>
  );
}

// shouldShowSmallThingToday now lives in @/lib/smallThingCadence and is
// re-exported at the top of this file so external callers don't break.
// Keeping pure logic out of component files makes it unit-testable
// from Node without loading React.
