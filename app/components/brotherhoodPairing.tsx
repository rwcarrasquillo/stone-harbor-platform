"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import { trackMilestone } from "@/lib/memberUsage";
import { serif } from "@/lib/fonts";

/**
 * Stone Harbor — BrotherhoodPairing.
 *
 * The opt-in weekly check-in pairing experience. Renders on the
 * /messages page in a tile above the existing inbox. Three possible
 * states:
 *
 *   1. NONE       — no active pairing, no open request. Show the
 *                   opt-in tile with two short questions.
 *   2. WAITING    — open request submitted, nobody to pair with yet.
 *                   Show a quiet "We'll let you know" panel with a
 *                   step-back option.
 *   3. PAIRED     — active pairing. Show partner info, preferences,
 *                   the rotating weekly question, and an end-pairing
 *                   option.
 *
 * Design rationale:
 *   Pairing strangers is the highest-anxiety feature in the harbor.
 *   The opt-in form is intentionally tiny (two text fields, plain
 *   language), the waiting state is gentle, and the paired state
 *   gives both members context about each other without forcing
 *   them to chat. Everything has an obvious step-back path.
 *
 * Weekly prompts:
 *   Rotated client-side from a static array of carefully framed
 *   questions. v1 doesn't need a DB-backed schedule — the array is
 *   short, intentional, and changes once per ISO week per member.
 */

type PairingState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "waiting"; requestId: string }
  | {
      kind: "paired";
      pairingId: string;
      partnerName: string | null;
      partnerUsername: string | null;
      partnerTime: string | null;
      partnerTopic: string | null;
      yourTime: string | null;
      yourTopic: string | null;
      startedAt: string;
      scheduledEndAt: string;
    };

const WEEKLY_PROMPTS = [
  "Ask your brother what they have been quietly carrying this week.",
  "Tell your brother about one small thing that surprised you.",
  "Ask your brother where they noticed themselves softening — even briefly.",
  "Share one moment from this week you almost shared with no one.",
  "Ask: what is the kindest thing you could tell yourself today?",
  "Tell your brother about one boundary you held — or wanted to.",
  "Ask your brother what they have been avoiding looking at.",
  "Share one place in your life where progress is happening too slowly.",
  "Ask: what is one thing your father would say about your week?",
  "Tell your brother one truth you have not said out loud yet.",
];

function isoWeekKey(date: Date): number {
  // Days since epoch, divided by 7. Stable per ISO week, no
  // calendar weirdness. Sufficient for rotating a 10-item array.
  return Math.floor(date.getTime() / (1000 * 60 * 60 * 24 * 7));
}

type Props = {
  userId: string;
};

export function BrotherhoodPairing({ userId }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const [state, setState] = useState<PairingState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [preferredTime, setPreferredTime] = useState("");
  const [topicFocus, setTopicFocus] = useState("");

  const refresh = useCallback(async () => {
    // 1. Is there an active pairing?
    const { data: pairing } = await supabase
      .from("brotherhood_pairings")
      .select(
        "id, user_a_id, user_b_id, user_a_preferred_time, user_a_topic_focus, user_b_preferred_time, user_b_topic_focus, started_at, scheduled_end_at",
      )
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .eq("status", "active")
      .maybeSingle();

    if (pairing) {
      const meIsA = pairing.user_a_id === userId;
      const partnerId = meIsA ? pairing.user_b_id : pairing.user_a_id;
      const yourTime = meIsA
        ? pairing.user_a_preferred_time
        : pairing.user_b_preferred_time;
      const yourTopic = meIsA
        ? pairing.user_a_topic_focus
        : pairing.user_b_topic_focus;
      const partnerTime = meIsA
        ? pairing.user_b_preferred_time
        : pairing.user_a_preferred_time;
      const partnerTopic = meIsA
        ? pairing.user_b_topic_focus
        : pairing.user_a_topic_focus;

      // Resolve partner display info. Don't surface email — that's
      // potentially identifying. display_name or username is enough.
      const { data: partner } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", partnerId)
        .maybeSingle();

      setState({
        kind: "paired",
        pairingId: pairing.id,
        partnerName: partner?.display_name ?? null,
        partnerUsername: partner?.username ?? null,
        partnerTime,
        partnerTopic,
        yourTime,
        yourTopic,
        startedAt: pairing.started_at,
        scheduledEndAt: pairing.scheduled_end_at,
      });
      return;
    }

    // 2. Is there an open request?
    const { data: openReq } = await supabase
      .from("brotherhood_pairing_requests")
      .select("id, preferred_time, topic_focus")
      .eq("user_id", userId)
      .eq("status", "open")
      .maybeSingle();

    if (openReq) {
      setState({ kind: "waiting", requestId: openReq.id });
      return;
    }

    setState({ kind: "none" });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleOptIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    // 1. Insert the open request.
    const { error: reqError } = await supabase
      .from("brotherhood_pairing_requests")
      .upsert(
        {
          user_id: userId,
          preferred_time: preferredTime.trim() || null,
          topic_focus: topicFocus.trim() || null,
          status: "open",
          matched_at: null,
          withdrawn_at: null,
        },
        { onConflict: "user_id" },
      );
    if (reqError) {
      setSubmitting(false);
      return;
    }
    // 2. Try to match. If a partner exists, the function returns a
    // pairing id and the request status flips to "matched."
    await supabase.rpc("match_brotherhood_pairing", { p_user_id: userId });
    trackMilestone("first_brotherhood_optin");
    await refresh();
    setSubmitting(false);
  }

  async function handleWithdraw() {
    if (state.kind !== "waiting") return;
    await supabase
      .from("brotherhood_pairing_requests")
      .update({ status: "withdrawn", withdrawn_at: new Date().toISOString() })
      .eq("id", state.requestId);
    await refresh();
  }

  async function handleEndPairing() {
    if (state.kind !== "paired") return;
    const confirmed = window.confirm(
      "End this pairing? Both you and your brother will return to the queue if you want to be paired again.",
    );
    if (!confirmed) return;
    await supabase.rpc("end_brotherhood_pairing", {
      p_pairing_id: state.pairingId,
    });
    await refresh();
  }

  const cardClasses = `relative border p-6 backdrop-blur-md md:p-8 ${
    isDusk
      ? "border-white/10 bg-black/35"
      : "border-[var(--sh-border-subtle)] bg-white/70"
  }`;

  if (state.kind === "loading") {
    return null;
  }

  if (state.kind === "none") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cardClasses}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
          Brotherhood pairing
        </p>
        <h3
          className={`${serif.className} mt-3 text-2xl italic leading-snug text-[var(--sh-text-primary)] md:text-3xl`}
        >
          A brother who checks in once a week.
        </h3>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          We will pair you with one other man for four weeks. A quiet
          weekly prompt to share with each other. No group. No therapist.
          Just a witness. Step back any time.
        </p>

        <form onSubmit={handleOptIn} className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
              When works best?
            </label>
            <input
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              placeholder="Mornings, weekends, etc."
              className={`w-full border px-4 py-3 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                isDusk
                  ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                  : "border-[var(--sh-border-medium)] bg-[#f8f4ed] text-[var(--sh-text-primary)]"
              }`}
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
              What do you want to be asked about?
            </label>
            <input
              value={topicFocus}
              onChange={(e) => setTopicFocus(e.target.value)}
              placeholder="Fatherhood, sobriety, work, anything"
              className={`w-full border px-4 py-3 text-sm transition focus:border-[var(--sh-accent-gold)] focus:outline-none ${
                isDusk
                  ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-stone-500"
                  : "border-[var(--sh-border-medium)] bg-[#f8f4ed] text-[var(--sh-text-primary)]"
              }`}
            />
          </div>
          <div className="md:col-span-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
              Both fields optional
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-none bg-[var(--sh-accent-gold)] px-7 py-3 text-xs font-bold uppercase tracking-[0.28em] text-white shadow-md transition hover:bg-[#8d6432] disabled:opacity-60"
            >
              {submitting ? "Joining..." : "Pair me with a brother"}
            </button>
          </div>
        </form>
      </motion.div>
    );
  }

  if (state.kind === "waiting") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cardClasses}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
          Brotherhood pairing · waiting
        </p>
        <h3
          className={`${serif.className} mt-3 text-2xl italic leading-snug text-[var(--sh-text-primary)] md:text-3xl`}
        >
          We are looking for a brother for you.
        </h3>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
          When another man opens the door, we will pair the two of you.
          There is no rush. The harbor is patient.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleWithdraw}
            className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
          >
            Step back
          </button>
        </div>
      </motion.div>
    );
  }

  // PAIRED
  const partnerDisplay =
    state.partnerName ||
    (state.partnerUsername ? `@${state.partnerUsername}` : "A brother");
  const weekIndex = isoWeekKey(new Date()) % WEEKLY_PROMPTS.length;
  const thisWeekPrompt = WEEKLY_PROMPTS[weekIndex];
  const endDate = new Date(state.scheduledEndAt);
  const endDateText = endDate.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={cardClasses}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
        Paired with a brother
      </p>
      <h3
        className={`${serif.className} mt-3 text-2xl italic leading-snug text-[var(--sh-text-primary)] md:text-3xl`}
      >
        {partnerDisplay}
      </h3>
      <p className="mt-3 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
        Through {endDateText}
        {state.partnerTime ? ` · ${state.partnerTime}` : ""}
        {state.partnerTopic ? ` · asks about ${state.partnerTopic}` : ""}
      </p>

      <div
        className={`mt-6 border-l-[3px] px-5 py-4 ${
          isDusk ? "bg-white/[0.03]" : "bg-[#f8f4ed]"
        }`}
        style={{ borderLeftColor: "var(--sh-accent-gold)" }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
          This week&apos;s question
        </p>
        <p
          className={`${serif.className} mt-2 text-lg italic leading-snug text-[var(--sh-text-primary)] md:text-xl`}
        >
          {thisWeekPrompt}
        </p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={handleEndPairing}
          className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[var(--sh-text-secondary)]"
        >
          End pairing
        </button>
        <p className="text-[10px] italic text-[var(--sh-text-muted)]">
          Reach out via Messages above when you are ready.
        </p>
      </div>
    </motion.div>
  );
}
