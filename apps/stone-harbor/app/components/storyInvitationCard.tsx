"use client";

/**
 * Stone Harbor — Story Invitation Card.
 *
 * The dashboard surface for the Story Series. When the founder is
 * signed in (M1 gate) and the surfacer returns a candidate prompt,
 * this card invites the man to write to it. Two affordances:
 *
 *   • "Write this story" — navigates to /journal?invitation_id=X,
 *     where the journal page renders the prompt as a header above
 *     the composer and captures engagement telemetry on save.
 *
 *   • "Not today" — calls /api/story/skip, which puts the prompt on
 *     a 7-day cooldown and (when possible) returns the next eligible
 *     prompt, so the card re-renders with a fresh invitation rather
 *     than disappearing entirely.
 *
 * Editorial: the card is quiet. No "5 of 36" progress, no streak
 * language, no urgency. Stone Harbor voice: a small offered question,
 * left on the table.
 *
 * Theming: matches the Today's Reflection tile's two-mode styling
 * (Dusk = dark glass + amniotic; Sunlit = warm cream).
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { supabase } from "@/lib/supabaseClient";
import { serif } from "@/lib/fonts";
import { useTheme } from "@/app/components/themeProvider";
import {
  createPendingInvitation,
  fetchInvitationHistory,
  fetchPromptPool,
  isFounderEmail,
  MVP_MAX_DEPTH,
  pickNextPrompt,
  type MemberStoryInvitation,
  type StoryPrompt,
} from "@/lib/story";

type Props = {
  /** auth.users.id of the current member. */
  userId: string;
  /** Email used for the founder gate. Pass null if unavailable. */
  userEmail: string | null;
};

type CardState =
  | { kind: "loading" }
  | { kind: "hidden" } // gate closed, or surfacer returned none
  | { kind: "ready"; invitation: MemberStoryInvitation; prompt: StoryPrompt };

export function StoryInvitationCard({ userId, userEmail }: Props) {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const t = useTranslations("dashboard.storyCard");

  const [state, setState] = useState<CardState>({ kind: "loading" });
  const [skipping, setSkipping] = useState(false);

  // Founder gate is a product gate, not a security one — see
  // lib/story/founderGate.ts. RLS already prevents data leaks.
  const isFounder = useMemo(() => isFounderEmail(userEmail), [userEmail]);

  useEffect(() => {
    if (!isFounder) {
      setState({ kind: "hidden" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pool = await fetchPromptPool(supabase, { seriesSlug: "dad" });
        const history = await fetchInvitationHistory(
          supabase,
          userId,
          pool.map((p) => p.id)
        );
        const result = pickNextPrompt({
          pool,
          history,
          now: new Date(),
          maxDepth: MVP_MAX_DEPTH,
        });

        if (cancelled) return;

        if (result.kind === "none") {
          setState({ kind: "hidden" });
          return;
        }

        let invitation: MemberStoryInvitation;
        let prompt: StoryPrompt | undefined;

        if (result.kind === "existing_pending") {
          invitation = result.invitation;
          prompt = pool.find((p) => p.id === invitation.prompt_id);
        } else {
          // result.kind === "create"
          invitation = await createPendingInvitation(
            supabase,
            userId,
            result.promptId
          );
          prompt = pool.find((p) => p.id === result.promptId);
        }

        if (!prompt) {
          setState({ kind: "hidden" });
          return;
        }
        setState({ kind: "ready", invitation, prompt });
      } catch (err) {
        // Fail closed: don't crash the dashboard if the story tables
        // aren't yet provisioned in some environment.
        console.warn("[story-card] surface failed:", err);
        setState({ kind: "hidden" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFounder, userId]);

  async function handleSkip() {
    if (state.kind !== "ready" || skipping) return;
    setSkipping(true);
    try {
      // The skip route is bearer-authenticated so it can validate
      // ownership before writing. Pull the current session token
      // from the supabase client (already in memory).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/story/skip", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ invitation_id: state.invitation.id }),
      });
      if (!res.ok) throw new Error(`skip failed: ${res.status}`);
      // Re-run the surfacer locally so the card reflects the next prompt
      // (or hides cleanly if nothing's eligible).
      const pool = await fetchPromptPool(supabase, { seriesSlug: "dad" });
      const history = await fetchInvitationHistory(
        supabase,
        userId,
        pool.map((p) => p.id)
      );
      const next = pickNextPrompt({
        pool,
        history,
        now: new Date(),
        maxDepth: MVP_MAX_DEPTH,
      });
      if (next.kind === "create") {
        const invitation = await createPendingInvitation(
          supabase,
          userId,
          next.promptId
        );
        const prompt = pool.find((p) => p.id === next.promptId);
        if (prompt) {
          setState({ kind: "ready", invitation, prompt });
          return;
        }
      }
      if (next.kind === "existing_pending") {
        const prompt = pool.find((p) => p.id === next.invitation.prompt_id);
        if (prompt) {
          setState({ kind: "ready", invitation: next.invitation, prompt });
          return;
        }
      }
      setState({ kind: "hidden" });
    } catch (err) {
      console.warn("[story-card] skip failed:", err);
      // Leave the card up — user can try again or just navigate away.
    } finally {
      setSkipping(false);
    }
  }

  if (state.kind !== "ready") return null;

  const { invitation, prompt } = state;
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="mb-6 md:mb-8"
      data-story-invitation-id={invitation.id}
    >
      <div
        className={`relative overflow-hidden rounded-none border px-4 py-6 shadow-[0_10px_30px_rgba(0,0,0,0.05)] md:px-10 md:py-10 ${
          isDusk
            ? "border-white/10 bg-black/30 backdrop-blur-xl shadow-[0_14px_50px_rgba(0,0,0,0.4)]"
            : "border-stone-200 bg-gradient-to-br from-[#f6f0e6] via-[#f1ebde] to-[#ece4d3]"
        }`}
      >
        <div className="relative mx-auto max-w-3xl text-center">
          <p
            className={`mb-3 text-[10px] font-bold uppercase tracking-[0.32em] md:mb-4 md:tracking-[0.38em] ${
              isDusk ? "text-[#c4934e]" : "text-[#a9793d]"
            }`}
          >
            {t("eyebrow")}
          </p>

          <p
            className={`${serif.className} mx-auto max-w-2xl text-xl font-medium italic leading-[1.25] tracking-[-0.01em] md:text-3xl ${
              isDusk ? "text-stone-100" : "text-stone-900"
            }`}
          >
            &ldquo;{prompt.prompt_text}&rdquo;
          </p>

          {prompt.est_minutes ? (
            <p
              className={`mt-3 text-[11px] uppercase tracking-[0.2em] md:mt-4 ${
                isDusk ? "text-stone-400" : "text-stone-500"
              }`}
            >
              {t("estMinutes", { minutes: prompt.est_minutes })}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col items-center justify-center gap-3 md:mt-8 md:flex-row md:gap-5">
            <Link
              href={`/journal?invitation_id=${invitation.id}`}
              className={`group inline-flex items-center justify-center border px-6 py-3 text-[11px] font-bold uppercase tracking-[0.24em] transition-all duration-300 md:px-8 md:py-3 md:tracking-[0.28em] ${
                isDusk
                  ? "border-[#c4934e] bg-[#c4934e] text-stone-900 hover:bg-[#a9793d]"
                  : "border-[#a9793d] bg-[#a9793d] text-stone-50 hover:bg-[#8a6230]"
              }`}
            >
              {t("writeStory")}
            </Link>

            <button
              type="button"
              onClick={handleSkip}
              disabled={skipping}
              className={`inline-flex items-center justify-center border px-6 py-3 text-[11px] font-bold uppercase tracking-[0.24em] transition-all duration-300 md:px-8 md:py-3 md:tracking-[0.28em] ${
                isDusk
                  ? "border-white/25 bg-transparent text-stone-200 hover:bg-white/5 disabled:opacity-50"
                  : "border-stone-400 bg-transparent text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              }`}
            >
              {skipping ? t("oneMoment") : t("notToday")}
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
