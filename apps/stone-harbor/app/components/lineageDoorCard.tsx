"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import { serif } from "@/lib/fonts";
import { getPreviewDayOverride } from "@/lib/userProgress";

/**
 * Stone Harbor — LineageDoorCard.
 *
 * The once-shown announcement that surfaces the Lineage room to the
 * member. Renders ONLY when:
 *
 *   1. The member has reached day 90 (or is previewing day 90+).
 *   2. profiles.lineage_door_seen_at is null (never shown before).
 *
 * Once dismissed (tap "Visit", "Not today", or the × button), we
 * record the timestamp so it never appears again — even if the
 * member never fills in the lineage fields. This is the rule: the
 * harbor offered once. After that, the door is in the profile, and
 * the man comes back to it on his own time.
 *
 * Preview mode behavior:
 *   When the founder is previewing day 90+, this card always shows
 *   regardless of lineage_door_seen_at, because preview is for
 *   verifying how the feature looks, not for permanently marking
 *   the real account.
 */

type Props = {
  /** The current member's user id. */
  userId: string;
  /** When the member has already seen this card (NULL = never shown). */
  lineageDoorSeenAt: string | null;
};

export function LineageDoorCard({ userId, lineageDoorSeenAt }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [dismissed, setDismissed] = useState(false);

  // Whether to render at all. In preview mode we show regardless of
  // seen_at. In real use, we hide once seen_at is set OR after this
  // session's user dismissed via the local state.
  const previewActive = getPreviewDayOverride() !== null;
  const alreadySeen = lineageDoorSeenAt !== null && !previewActive;
  if (alreadySeen || dismissed) return null;

  // Record that the announcement was rendered. Writes regardless of
  // preview mode so testing the persistence path works end-to-end.
  // To re-test the card after dismissal, manually reset the column:
  //
  //   update profiles set lineage_door_seen_at = null
  //   where id = '<your-user-id>';
  //
  // Or stay in preview mode — the card always shows when previewing
  // because the visibility check at the top of this component
  // bypasses lineage_door_seen_at when a preview override is active.
  async function markSeen() {
    setDismissed(true);
    // Fire-and-forget. The Link's navigation will tear down this
    // component while the request is in flight; that's fine — supabase
    // queues the write before navigation begins. We deliberately do
    // NOT await: blocking on the update would delay the page
    // transition by ~150ms with no UX benefit.
    void supabase
      .from("profiles")
      .update({ lineage_door_seen_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`relative border p-7 md:p-9 ${
          isDusk
            ? "border-white/10 bg-black/30 backdrop-blur-md"
            : "border-[var(--sh-border-subtle)] bg-white/70 backdrop-blur-sm"
        }`}
        // Add a quiet left bar in brand gold so the man's eye sees
        // this as a different kind of card than the rest — a soft
        // signal that this is a one-time message, not a recurring
        // tile.
        style={{ borderLeftWidth: 3, borderLeftColor: "var(--sh-accent-gold)" }}
        aria-label="A new room in your profile"
      >
        {/* Dismiss button (×) in the corner. A second, equally weighted
            way to exit besides the "Not today" link below. */}
        <button
          type="button"
          onClick={markSeen}
          aria-label="Dismiss"
          className="absolute right-4 top-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
        >
          ×
        </button>

        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
          A new room in your profile
        </p>
        <h3
          className={`${serif.className} mt-3 text-2xl italic leading-snug text-[var(--sh-text-primary)] md:text-3xl`}
        >
          There&apos;s a quiet room called Lineage.
        </h3>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          It&apos;s for the things you carry from before you — what your
          father did with grief, with anger, and one pattern you&apos;d
          like to leave behind. Not required. Not displayed anywhere.
          The room is in your profile when you want it. Or not.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={markSeen}
            className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
          >
            Not today
          </button>
          <Link
            href="/welcome#lineage"
            onClick={markSeen}
            className="inline-block rounded-none bg-[var(--sh-accent-gold)] px-7 py-3 text-xs font-bold uppercase tracking-[0.28em] text-white shadow-md transition hover:bg-[#8d6432]"
          >
            Visit the room
          </Link>
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
