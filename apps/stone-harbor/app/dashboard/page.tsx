"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif } from "@/lib/fonts";
import {
  Anchor as AnchorIcon,
  Edit as EditIcon,
  Logout,
  Message,
} from "@/app/components/icons";
import { X } from "lucide-react";
import { PageAmbience } from "@/app/components/pageAmbience";
import {
  SmallThing,
  shouldShowSmallThingToday,
} from "@/app/components/smallThing";
import { LineageDoorCard } from "@/app/components/lineageDoorCard";
import { TheMapTile } from "@/app/components/theMapTile";
import { RhythmTile } from "@/app/components/rhythmTile";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import { useTheme } from "@/app/components/themeProvider";
import { PersonalizedGreeting } from "@/app/components/personalizedGreeting";
import { TodayIntention } from "@/app/components/todayIntention";
import { StoryInvitationCard } from "@/app/components/storyInvitationCard";
import { BreathCircle } from "@/app/components/breathCircle";
import {
  dismissalKey,
  resolveActiveAcknowledgment,
  type Acknowledgment,
} from "@/lib/seasonalAcknowledgments";

/**
 * Stone Harbor — Dashboard v2 (recognition-first three-band restructure).
 *
 * Backup of the pre-redesign 2648-line dashboard lives at
 * app/dashboard/_archive/page-pre-recognition-redesign-2026-06-14.tsx.bak
 * (Next.js ignores _archive folders and .bak files in routing).
 *
 * The redesign follows Stone_Harbor_Harbor_Voice.md and the dashboard
 * tightening analysis (2026-06-14). Three vertical bands replace the
 * 12-15 surfaces the prior dashboard accumulated:
 *
 *   1. RECOGNITION — PersonalizedGreeting (already days-aware) +
 *      AcknowledgmentNotification (seasonal/birthday) + one
 *      NotificationCard slot when active. The harbor demonstrates
 *      memory at the top of fold; the member opens the door and is
 *      seen.
 *
 *   2. TONIGHT'S OFFERING — ONE invitation. StoryInvitationCard when
 *      a Story Series prompt is available; otherwise TodayIntention
 *      as the open writing surface. SmallThing slots in below this
 *      band on its disciplined cadence (day 75+, 2-3 days/week max,
 *      never consecutive).
 *
 *   3. OTHER ROOMS — TheMapTile, RhythmTile, LineageDoorCard (when
 *      unlocked), and the Meditation room. Consolidated into a single
 *      visual container with a small section header. Available, not
 *      demanding.
 *
 * Removed from the prior dashboard:
 *   - Streak / Tomorrow / Brotherhood greeting strip (§3 voice
 *     violation — "Counts streaks. No 'you missed.'"). The Streak
 *     card with Flame icon was the most direct violation; removing
 *     the whole strip cleans up the surrounding density too.
 *   - Daily Quote standalone hero (repurposed — the visual real
 *     estate is right; the content was passive consumption).
 *   - Ripples composer + feed (moved to /brotherhood per existing
 *     TODO in the prior dashboard's source).
 *   - Profile card (was already hidden via CSS; moved to /welcome).
 *
 * Mobile-first geometry preserved — single column throughout, no
 * sidebars. Visual discipline per §4: negative space increased,
 * accents reduced, animations slowed.
 */

// Two-color discipline — gold for the warm "tonight" gesture, moss
// for the journey rooms. Less variety than the prior dashboard's
// flame/stage/theme accents.
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

type Profile = {
  email: string | null;
  display_name: string | null;
  username: string | null;
  healing_stage: string | null;
  avatar_url: string | null;
  birth_month?: number | null;
  birth_day?: number | null;
  acknowledge_birthday?: boolean;
  seasonal_acknowledgments_enabled?: boolean;
  acknowledgments_dismissed?: Record<string, string> | null;
};

type Notification = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

const COPY = {
  en: {
    nav: {
      journal: "Journal",
      messages: "Messages",
      editProfile: "Edit profile",
      logout: "Sign out",
    },
    acknowledgment: {
      dismiss: "Dismiss",
      dontShowAgain: "Don't show this again",
    },
    rooms: {
      header: "Other rooms",
    },
    meditation: {
      eyebrow: "The Breath",
      title: "Sit with the breath.",
      body: "A few unhurried minutes. Ambient sound, a slow circle, nothing to do.",
      cta: "Open the room",
    },
  },
  es: {
    nav: {
      journal: "Diario",
      messages: "Mensajes",
      editProfile: "Editar perfil",
      logout: "Cerrar sesión",
    },
    acknowledgment: {
      dismiss: "Descartar",
      dontShowAgain: "No mostrar esto otra vez",
    },
    rooms: {
      header: "Otras habitaciones",
    },
    meditation: {
      eyebrow: "La Respiración",
      title: "Siéntate con la respiración.",
      body: "Unos minutos sin prisa. Sonido ambiental, un círculo lento, nada que hacer.",
      cta: "Abrir la habitación",
    },
  },
} as const;

export default function DashboardPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  // `t` retained for any future scoped translations the dashboard
  // chrome needs. The current bands inline EN+ES via the COPY const.
  useTranslations("dashboard");

  // Locale for the inline strings. The locale-aware page chrome
  // (header CTAs, rooms label) reads from this; sub-components
  // (PersonalizedGreeting, StoryInvitationCard, etc.) each call
  // their own useTranslations.
  const [locale, setLocale] = useState<"en" | "es">("en");
  useEffect(() => {
    const cookie = typeof document !== "undefined" ? document.cookie : "";
    const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookie);
    setLocale(m?.[1] === "es" ? "es" : "en");
  }, []);
  const c = COPY[locale];

  // Core state. Pared down from the prior dashboard's 30+ pieces
  // of state to just what the three bands need.
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [lineageDoorSeenAt, setLineageDoorSeenAt] = useState<string | null>(
    null,
  );

  // Recognition band — acknowledgments + notifications.
  const [acknowledgment, setAcknowledgment] = useState<Acknowledgment | null>(
    null,
  );
  const [ackDismissing, setAckDismissing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Breath phase for the meditation room's BreathCircle. Cycles in
  // the background even when the room is just sitting there.
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 5500);
    return () => clearInterval(id);
  }, []);

  // ── Auth + profile + notifications load ───────────────────────────
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      setUserId(null);
      return;
    }
    const uid = session.user.id;
    const createdAt = session.user.created_at ?? null;
    setUserId(uid);
    setUserCreatedAt(createdAt);

    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "email, display_name, username, healing_stage, avatar_url, birth_month, birth_day, acknowledge_birthday, seasonal_acknowledgments_enabled, acknowledgments_dismissed, lineage_door_seen_at",
      )
      .eq("user_id", uid)
      .maybeSingle();

    const loadedProfile: Profile = {
      email: profileData?.email ?? session.user.email ?? null,
      display_name: profileData?.display_name ?? null,
      username: profileData?.username ?? null,
      healing_stage: profileData?.healing_stage ?? null,
      avatar_url: profileData?.avatar_url ?? null,
      birth_month: profileData?.birth_month ?? null,
      birth_day: profileData?.birth_day ?? null,
      acknowledge_birthday: profileData?.acknowledge_birthday ?? true,
      seasonal_acknowledgments_enabled:
        profileData?.seasonal_acknowledgments_enabled ?? true,
      acknowledgments_dismissed:
        (profileData?.acknowledgments_dismissed as
          | Record<string, string>
          | null) ?? null,
    };
    setProfile(loadedProfile);

    const lineageSeen =
      (profileData as { lineage_door_seen_at?: string | null } | null)
        ?.lineage_door_seen_at ?? null;
    setLineageDoorSeenAt(lineageSeen);

    // Today's acknowledgment (birthday + seasonal). Same helper the
    // prior dashboard used; respects the per-key dismissal map and
    // the global silence flag for birthdays.
    setAcknowledgment(
      resolveActiveAcknowledgment({
        now: new Date(),
        birthMonth: loadedProfile.birth_month,
        birthDay: loadedProfile.birth_day,
        acknowledgeBirthday: loadedProfile.acknowledge_birthday ?? true,
        seasonalEnabled:
          loadedProfile.seasonal_acknowledgments_enabled ?? true,
        dismissed: loadedProfile.acknowledgments_dismissed,
      }),
    );

    // Notifications — cap at one slot per §3 (one time-sensitive
    // thing at the top, max). Take the most recent undismissed.
    const { data: notifData } = await supabase
      .from("notifications")
      .select("id, kind, payload, read_at, dismissed_at, created_at")
      .eq("user_id", uid)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    setNotifications((notifData ?? []) as Notification[]);
  }

  // ── Acknowledgment dismissal ──────────────────────────────────────
  async function dismissAcknowledgment(silenceForFuture: boolean) {
    if (!acknowledgment || !userId || !profile) return;
    setAckDismissing(true);
    try {
      const dismissed = { ...(profile.acknowledgments_dismissed ?? {}) };
      dismissed[dismissalKey(acknowledgment.key)] = new Date().toISOString();
      const updates: Partial<Profile> = {
        acknowledgments_dismissed: dismissed,
      };
      if (silenceForFuture) {
        if (acknowledgment.key === "birthday") {
          updates.acknowledge_birthday = false;
        } else {
          updates.seasonal_acknowledgments_enabled = false;
        }
      }
      await supabase.from("profiles").update(updates).eq("user_id", userId);
      setProfile({ ...profile, ...updates });
      setAcknowledgment(null);
    } finally {
      setAckDismissing(false);
    }
  }

  async function dismissNotification(id: string) {
    await supabase
      .from("notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  // ── Derived gates ─────────────────────────────────────────────────
  const showSmallThing =
    userId !== null &&
    userCreatedAt !== null &&
    isFeatureUnlocked(userCreatedAt, FEATURE_THRESHOLDS.smallThings) &&
    shouldShowSmallThingToday(userId);

  const lineageUnlocked =
    userCreatedAt !== null &&
    isFeatureUnlocked(userCreatedAt, FEATURE_THRESHOLDS.lineage);

  const topNotification = notifications[0] ?? null;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen overflow-hidden text-[var(--sh-text-primary)]">
      <InactivityGate />
      <PageAmbience />

      {/* Header strip — Journal + Messages + Edit profile + Sign out.
          Pared down from the prior dashboard's chrome. Logout sits
          rightmost so the gentler nav reads first. */}
      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 pb-2 pt-6 md:px-8 md:pt-10">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
          <Link
            href="/journal"
            className="flex items-center gap-1.5 transition hover:text-[var(--sh-accent-gold)]"
          >
            <EditIcon size={14} />
            <span>{c.nav.journal}</span>
          </Link>
          <span className="opacity-40">·</span>
          <Link
            href="/messages"
            className="flex items-center gap-1.5 transition hover:text-[var(--sh-accent-gold)]"
          >
            <Message size={14} />
            <span>{c.nav.messages}</span>
          </Link>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
          <Link
            href="/welcome"
            className="hidden items-center gap-1.5 transition hover:text-[var(--sh-accent-gold)] md:flex"
          >
            <AnchorIcon size={14} />
            <span>{c.nav.editProfile}</span>
          </Link>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="flex items-center gap-1.5 transition hover:text-[var(--sh-accent-gold)]"
          >
            <Logout size={14} />
            <span>{c.nav.logout}</span>
          </button>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-8 md:pb-24 md:pt-10">
        {/* ═══════════════════════════════════════════════════════════
            BAND 1 — RECOGNITION

            PersonalizedGreeting does the days-aware "welcome back"
            work (already voice-aligned, see component for the
            time-of-day + days-since logic). Acknowledgment surfaces
            on Father's Day, Christmas, birthday, etc. — best-in-class
            for the category, makes space without assuming joy or
            grief. Notification at most one slot.
            ═══════════════════════════════════════════════════════════ */}

        <PersonalizedGreeting
          name={profile?.display_name || profile?.username || null}
          userId={userId}
        />

        <AnimatePresence>
          {acknowledgment && (
            <motion.section
              key={acknowledgment.key}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className={`relative mb-8 overflow-hidden border border-l-[3px] px-4 py-4 md:mb-10 md:px-10 md:py-7 ${
                isDusk
                  ? "border-white/10 bg-black/35 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
                  : "border-stone-200 bg-[#f8f4ed] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
              }`}
              style={{ borderLeftColor: GOLD_DEEP }}
            >
              <button
                type="button"
                disabled={ackDismissing}
                onClick={() => dismissAcknowledgment(false)}
                aria-label={c.acknowledgment.dismiss}
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center text-[var(--sh-text-muted)] transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50 md:right-3 md:top-3"
              >
                <X size={18} aria-hidden="true" />
              </button>
              <div className="pr-8 md:pr-10">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--sh-accent-gold)] md:tracking-[0.32em]">
                  {acknowledgment.eyebrow}
                </p>
                <p
                  className={`${serif.className} mt-2 text-xl italic leading-[1.2] text-[var(--sh-text-primary)] md:mt-3 md:text-3xl`}
                >
                  {acknowledgment.headline}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sh-text-secondary)] md:mt-4 md:text-base">
                  {acknowledgment.body}
                </p>
                <button
                  type="button"
                  disabled={ackDismissing}
                  onClick={() => dismissAcknowledgment(true)}
                  className="mt-3 text-[10px] text-[var(--sh-text-tertiary)] underline-offset-4 transition hover:text-[var(--sh-accent-gold)] hover:underline disabled:opacity-50 md:mt-4 md:text-[11px]"
                >
                  {c.acknowledgment.dontShowAgain}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {topNotification && (
          <motion.section
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mb-8 border border-l-[3px] border-l-[#586558] border-y-white/10 border-r-white/10 bg-black/25 px-4 py-3 backdrop-blur-md md:px-6 md:py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-relaxed text-[var(--sh-text-secondary)] md:text-base">
                {formatNotificationCopy(topNotification, locale)}
              </p>
              <button
                type="button"
                onClick={() => dismissNotification(topNotification.id)}
                aria-label={c.acknowledgment.dismiss}
                className="shrink-0 text-[var(--sh-text-muted)] transition hover:text-[var(--sh-accent-gold)]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </motion.section>
        )}

        {/* ═══════════════════════════════════════════════════════════
            BAND 2 — TONIGHT'S OFFERING

            ONE invitation. StoryInvitationCard when a Story Series
            prompt is eligible (the card self-hides when there isn't
            one). Otherwise TodayIntention as the open writing surface
            with a soft "What wants to be said tonight?" prompt.

            SmallThing sits below this band when it's its day (day 75+,
            2-3 days/week max).
            ═══════════════════════════════════════════════════════════ */}

        {userId && (
          <div className="mb-12 md:mb-16">
            <StoryInvitationCard
              userId={userId}
              userEmail={profile?.email ?? null}
            />
            <TodayIntention userId={userId} />
          </div>
        )}

        {showSmallThing && userId && (
          <div className="mb-12 md:mb-16">
            <SmallThing userId={userId} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            BAND 3 — OTHER ROOMS

            The harbor's structured surfaces — The Map (Operating
            Manual), Rhythm (Eidos circadian mirror), the Meditation
            room, and the Lineage door (when unlocked at day 90+).

            Available, not demanding. One small section header, low-
            contrast sub-rows with shared visual language. The unified
            container signals "these belong together" without each
            tile shouting for individual attention.
            ═══════════════════════════════════════════════════════════ */}

        {userId && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--sh-text-tertiary)]">
              {c.rooms.header}
            </p>
            <div className="mt-6 space-y-4 md:mt-8 md:space-y-6">
              <TheMapTile />
              <RhythmTile />
              {lineageUnlocked && (
                <LineageDoorCard
                  userId={userId}
                  lineageDoorSeenAt={lineageDoorSeenAt}
                />
              )}
              <MeditationRoom
                isDusk={isDusk}
                breathPhase={breathPhase}
                copy={c.meditation}
              />
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

// ============================================================================
// Meditation room — inline sub-component for Band 3
// ============================================================================
// The prior dashboard's full-width breath-circle banner ate ~10in of
// vertical for what was essentially "go to /meditation." This is the
// same affordance compressed into a Rooms sub-row that shares visual
// language with TheMapTile + RhythmTile. The BreathCircle still
// breathes — present but quiet.

interface MeditationCopy {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}

function MeditationRoom({
  isDusk,
  breathPhase,
  copy,
}: {
  isDusk: boolean;
  breathPhase: "inhale" | "exhale";
  copy: MeditationCopy;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        href="/meditation"
        className={`group flex items-center gap-5 border p-6 transition md:p-8 ${
          isDusk
            ? "border-white/10 bg-[var(--sh-card-bg)] hover:bg-white/[0.04]"
            : "border-stone-200 bg-white/70 hover:bg-[#f8f4ed]/40"
        }`}
      >
        <div className="shrink-0">
          <BreathCircle phase={breathPhase} size="sm" accent={MOSS} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.36em]"
            style={{ color: MOSS }}
          >
            {copy.eyebrow}
          </p>
          <p
            className={`${serif.className} mt-2 text-xl font-medium leading-tight text-[var(--sh-text-primary)] md:text-2xl`}
          >
            {copy.title}
          </p>
          <p className="mt-2 hidden text-sm leading-relaxed text-[var(--sh-text-secondary)] md:block">
            {copy.body}
          </p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-muted)] transition group-hover:text-[var(--sh-accent-gold)]">
            {copy.cta} →
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// Voice-aligned notification copy. The prior dashboard delegated this
// to the NotificationCard component + scattered translation keys; the
// new dashboard renders one slot inline (per §3 "one time-sensitive
// thing at the top, max"), so the copy lives here. Hedged language,
// no urgency framing, no quantification of the member.
function formatNotificationCopy(
  n: Notification,
  locale: "en" | "es",
): string {
  if (locale === "es") {
    switch (n.kind) {
      case "solidarity_threshold":
        return "Alguien más se ha unido contigo.";
      case "daily_solidarity_summary":
        return "El puerto estuvo despierto contigo hoy.";
      case "warning_issued":
        return "Hay una nota para ti en tu perfil.";
      case "suspension_lifted":
        return "Tu cuenta está activa otra vez.";
      default:
        return "Algo te espera dentro.";
    }
  }
  switch (n.kind) {
    case "solidarity_threshold":
      return "Someone else stood with you.";
    case "daily_solidarity_summary":
      return "The harbor was awake with you today.";
    case "warning_issued":
      return "There's a note for you in your profile.";
    case "suspension_lifted":
      return "Your account is active again.";
    default:
      return "Something is waiting for you inside.";
  }
}

// Keep these for downstream consumers that may import them.
export { GOLD, GOLD_DEEP, MOSS };
