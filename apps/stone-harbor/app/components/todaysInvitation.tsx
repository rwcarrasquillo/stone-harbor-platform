"use client";

/**
 * Stone Harbor — today's invitation (SH-120, spine Ship 2A).
 *
 * The harbor's half of the daily exchange. TodayIntention asks the
 * member what they want the day to be about; this asks nothing and
 * offers one thing instead. The two sit next to each other on purpose
 * and neither replaces the other.
 *
 * Renders only when spine content adaptation is on AND the member is
 * placed on the path — see getSpineContentContext, which collapses
 * every "not applicable" case (either flag off, never placed, stale
 * step id, failed read) into a single null. Self-hiding in the same
 * way StoryInvitationCard is: on a day with nothing to offer, the
 * dashboard simply composes without this band. No empty state, no
 * "content coming soon" (design brief §7.4).
 *
 * THE WEEK'S RHYTHM (invitationClassForDay in lib/spine):
 *   Mon · Thu → a prompt      Tue · Fri → a letter
 *   Wed · Sat → a meditation  Sun       → nothing
 *
 * Where each class gets its content, which is NOT what the design
 * brief assumed — the brief expected all three to come from blog_posts
 * rows distinguished by `category`, but prod blog_posts carries exactly
 * one category value ('Recovery') and holds letters only:
 *
 *   prompt     → lib/dailyPrompts, narrowed to the step's stage
 *   letter     → blog_posts, step-tagged first then stage via `pillar`
 *   meditation → a nudge to /meditation, which is a fixed box-breath
 *                sanctuary with no content rows to vary (design brief
 *                §4.4 — that surface is deliberately not touched)
 *
 * Only the letter class can come up empty, so the fall-through below
 * lands on the next class in the cycle rather than dropping the day.
 *
 * Visual lineage: the CurrentStepPanel treatment one step quieter —
 * same top HairlineLens and farol tint, smaller type, no peek section.
 * It reads as something the step panel hands down, not as a sibling.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { serif, sans } from "@/lib/fonts";
import { HairlineLens } from "@/app/components/hairlineLens";
import { CardSkeleton } from "@/app/components/cardSkeleton";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import {
  getSpineContentContext,
  invitationClassForDay,
  type InvitationClass,
  type RoadmapStage,
} from "@/lib/spine";
import { getPromptForDay, stagePromptForDay } from "@/lib/dailyPrompts";

/** What the card ends up rendering, once a class has found content. */
type Invitation = {
  kind: InvitationClass;
  /** Serif line — a letter title, a prompt question, or the breath line. */
  body: string;
  href: string;
};

/**
 * The letters shape this component needs. Publish state lives on the
 * TRANSLATION, not the parent row — blog_posts.is_published is
 * vestigial post-i18n. Mirrors the embed in app/letters/page.tsx.
 */
type LetterRow = {
  id: string;
  pillar: string | null;
  roadmap_step_id: string | null;
  translation: { title: string }[] | { title: string } | null;
};

function firstTranslationTitle(row: LetterRow): string | null {
  const t = row.translation;
  if (!t) return null;
  const one = Array.isArray(t) ? t[0] : t;
  return one?.title ?? null;
}

/**
 * Pick one candidate for today. Deliberately NOT random: the invitation
 * has to survive a refresh, and a card that reshuffles every reload
 * reads as a slot machine rather than as the day's one offer. Indexing
 * by day-of-year gives the same letter all day and a different one
 * tomorrow — the same contract lib/dailyPrompts has always had.
 */
function pickForToday<T>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor(
    (Number(now) - Number(startOfYear)) / (1000 * 60 * 60 * 24),
  );
  return candidates[day % candidates.length];
}

async function resolveLetter(
  stage: RoadmapStage,
  stepId: string,
  locale: string,
): Promise<{ id: string; title: string } | null> {
  // One round trip for both bindings: rows tagged to this exact step
  // (Ship 2B's editorial hook, NULL on every row today) and rows whose
  // pillar matches the step's stage (live now — 32 letters per stage).
  const { data, error } = await supabase
    .from("blog_posts")
    .select(
      `
      id,
      pillar,
      roadmap_step_id,
      translation:blog_post_translations!inner (
        title,
        is_published,
        language
      )
    `,
    )
    .eq("consumer", "stone_harbor")
    // Filters go on the embed ALIAS, not the underlying table name —
    // see the long note in app/letters/page.tsx for why.
    .eq("translation.language", locale)
    .eq("translation.is_published", true)
    .or(`roadmap_step_id.eq.${stepId},pillar.eq.${stage}`);

  if (error || !data) return null;

  const rows = data as unknown as LetterRow[];
  // Step-tagged content outranks stage-matched content wherever it
  // exists, so Ship 2B sharpens this card with no code change.
  const stepTagged = rows.filter((r) => r.roadmap_step_id === stepId);
  const chosen = pickForToday(stepTagged.length > 0 ? stepTagged : rows);
  if (!chosen) return null;

  const title = firstTranslationTitle(chosen);
  return title ? { id: chosen.id, title } : null;
}

export function TodaysInvitation({
  userId,
  cascadeStep,
}: {
  userId: string;
  /** Index into the dashboard's entrance cascade (see lib/motion). */
  cascadeStep: number;
}) {
  const t = useTranslations("spine");
  const { theme } = useTheme();
  const locale = useLocale();
  const isDusk = theme === "dusk";

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  // SH-123 — distinguishes "still asking" from "nothing today", which
  // this component previously collapsed into the same null invitation.
  // Both rendered nothing, so the card popped in late and shoved the
  // rest of the dashboard down; now only the second one renders nothing.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const ctx = await getSpineContentContext(supabase, userId);
        if (!alive || !ctx) return;

        const today = invitationClassForDay(new Date().getDay());
        if (!today) return; // Sunday — the harbor asks for nothing.

        // Fall through the cycle from today's class, so a stage with no
        // letters yet offers the next thing rather than nothing.
        const order: InvitationClass[] = [
          today,
          ...(["prompt", "letter", "meditation"] as InvitationClass[]).filter(
            (c) => c !== today,
          ),
        ];

        for (const kind of order) {
          if (kind === "prompt") {
            const p = stagePromptForDay(ctx.stage) ?? getPromptForDay(0);
            if (alive) {
              setInvitation({
                kind,
                body: p.question,
                href: "/journal/compose",
              });
            }
            return;
          }

          if (kind === "meditation") {
            if (alive) {
              setInvitation({
                kind,
                body: t("invitation.meditationLine"),
                href: "/meditation",
              });
            }
            return;
          }

          const letter = await resolveLetter(ctx.stage, ctx.step.id, locale);
          if (!alive) return;
          if (letter) {
            // /letters is a single surface with an inline reader and no
            // per-letter route, so this lands on the library rather than
            // the letter itself. The member's stage sorts first there,
            // so the named letter sits near the top. A deep link needs a
            // reader route on /letters — tracked as a follow-up.
            setInvitation({ kind, body: letter.title, href: "/letters" });
            return;
          }
        }
      } catch {
        // Never the reason a dashboard fails to compose.
      } finally {
        // Runs on every exit above, including the early returns inside
        // the loop — so the skeleton always resolves to either a card
        // or nothing, and can never strand itself shimmering.
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // `t` and `locale` are stable for a given render tree; re-running on
    // them would refetch the letter on every theme re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Still asking. Same width tier and margin as the real card, so the
  // page it hands over to is the page the member was already reading.
  if (loading) {
    return (
      <CardSkeleton
        lines={2}
        className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]"
      />
    );
  }

  // Nothing today — and that includes the surrounding spacing. The
  // component owns its own margin precisely so a quiet day costs the
  // dashboard no gap where a card would have been.
  if (!invitation) return null;

  return (
    <motion.div
      {...cascadeFadeUp}
      transition={cascadeTransition(cascadeStep)}
      // px-10 against a 920px cap puts the panel's edges at 840px on
      // lg+ — the width tier CurrentStepPanel sits at, so the two align.
      className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]"
    >
    <section
      className={`relative overflow-hidden px-6 py-6 lg:px-8 ${
        isDusk
          ? "bg-black/30 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-md"
          : "bg-[var(--sh-bg-card-tinted)] shadow-[0_10px_30px_rgba(0,0,0,0.05)]"
      }`}
      style={{
        backgroundImage: isDusk
          ? "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.01) 60%, transparent 95%)"
          : "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(196,147,78,0.07) 0%, rgba(196,147,78,0.035) 30%, rgba(196,147,78,0.015) 60%, transparent 95%)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
        <HairlineLens position="top" theme={theme} />
      </div>

      <p
        className={`${sans.className} text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
      >
        {t(`invitation.eyebrow.${invitation.kind}`)}
      </p>
      <p
        className={`${serif.className} mt-3 text-lg italic leading-[1.35] text-[var(--sh-text-primary)] md:text-xl`}
      >
        {invitation.body}
      </p>

      <div className="mt-5 flex justify-end">
        <Link
          href={invitation.href}
          className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--sh-accent-gold)] hover:underline`}
        >
          {t(`invitation.action.${invitation.kind}`)}
        </Link>
      </div>
    </section>
    </motion.div>
  );
}
