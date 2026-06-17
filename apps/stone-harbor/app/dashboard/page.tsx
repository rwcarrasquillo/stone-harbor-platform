"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import {
  Edit as EditIcon,
  Logout,
  Message,
} from "@/app/components/icons";
import { X } from "lucide-react";
import {
  SmallThing,
  shouldShowSmallThingToday,
} from "@/app/components/smallThing";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import { useTheme } from "@/app/components/themeProvider";
import { AnchorMark } from "@/app/components/anchorMark";
import { PersonalizedGreeting } from "@/app/components/personalizedGreeting";
import { TodayIntention } from "@/app/components/todayIntention";
import { StoryInvitationCard } from "@/app/components/storyInvitationCard";
import {
  dismissalKey,
  resolveActiveAcknowledgment,
  type Acknowledgment,
} from "@/lib/seasonalAcknowledgments";

/**
 * Stone Harbor — Dashboard route (production, centered design).
 *
 * Recognition-first hub composed in the harbor vocabulary shared with
 * /journal. The page reads top-to-bottom in a single visual axis:
 *
 *   - Brand header (anchor + "Stone Harbor · Home" on the left,
 *     account-level nav on the right: Edit profile · Sign out)
 *   - Today's Harbor strip — the daily PersonalizedGreeting
 *   - Personal recognition + offering bands, max-w-[720px] centered:
 *     · Acknowledgment card (seasonal/birthday, conditional)
 *     · Notification card (one slot max, conditional)
 *     · Today's Intention (writing prompt input)
 *     · Small Thing (day 75+, cadenced)
 *   - A Story to Tell — feature panel at max-w-[920px], breaks the
 *     reading column to become the day's deliberate invitation
 *   - Horizon mark + "The harbor is patient." voice signature
 *   - Rooms catalog — 7 RoomCards in one horizontal row:
 *     Vent · Messages · The Map · JOURNAL · Rhythm · Lineage · The
 *     Breath. Journal sits at the exact center as the default
 *     highlight; engraved-gold lens hairlines + warm bg-tint appear
 *     on Journal by default and follow the cursor across cards on
 *     hover, returning to Journal when the cursor leaves the strip.
 *
 * Crisis footer permanently visible at the viewport bottom via the
 * h-full layout pattern (the page fills viewport - crisis_footer; the
 * 988 band sits below as a sibling at body level).
 *
 * The dashboard is read-only navigation — writing happens on /journal
 * which holds the unified compose/read surface. From here, members
 * either click Journal to enter the writing room, or one of the
 * other rooms to enter that destination.
 */

// Accent colors used for the acknowledgment + notification cards' left
// gold/moss bars (only places these literals are referenced now that the
// MeditationRoom inline component and BreathCircle have moved into the
// compact RoomCard treatment). Kept as named constants for clarity.
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
    anchor: {
      eyebrow: "Today's harbor",
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
    anchor: {
      eyebrow: "Bahía de hoy",
    },
  },
} as const;

export default function DashboardCenteredPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  useTranslations("dashboard");

  const [locale, setLocale] = useState<"en" | "es">("en");
  useEffect(() => {
    const cookie = typeof document !== "undefined" ? document.cookie : "";
    const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookie);
    setLocale(m?.[1] === "es" ? "es" : "en");
  }, []);
  const c = COPY[locale];

  // Mobile note: this used to redirect to /dashboard (the old
  // responsive layout) when the centered design lived at
  // /dashboard-centered. Now that the centered design IS /dashboard,
  // a self-redirect would loop. The redirect is removed; mobile
  // viewports render the same centered layout, which is desktop-first.
  // Responsive tuning for narrow viewports is a follow-up — for now,
  // mobile members see a wide row of room cards that scrolls
  // horizontally via the existing overflow-x-auto.

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  const [lineageDoorSeenAt, setLineageDoorSeenAt] = useState<string | null>(
    null,
  );
  const [acknowledgment, setAcknowledgment] = useState<Acknowledgment | null>(
    null,
  );
  const [ackDismissing, setAckDismissing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

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

    const { data: notifData } = await supabase
      .from("notifications")
      .select("id, kind, payload, read_at, dismissed_at, created_at")
      .eq("user_id", uid)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    setNotifications((notifData ?? []) as Notification[]);
  }

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

  const showSmallThing =
    userId !== null &&
    userCreatedAt !== null &&
    isFeatureUnlocked(userCreatedAt, FEATURE_THRESHOLDS.smallThings) &&
    shouldShowSmallThingToday(userId);

  const lineageUnlocked =
    userCreatedAt !== null &&
    isFeatureUnlocked(userCreatedAt, FEATURE_THRESHOLDS.lineage);

  const topNotification = notifications[0] ?? null;

  return (
    <div
      // Transparent wrapper. Globals.css paints the body backdrop
      // (warm gradient + paper grain on sunlit, gold ambient on dusk),
      // which shows through this page for consistency with /journal.
      //
      // h-full (not h-screen) so the page fills the available space
      // inside the root layout's flex column — viewport minus the
      // body-level GlobalCrisisFooter. The 988 band stays permanently
      // visible at the bottom of the viewport, never below the fold.
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-hidden text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col">
        {/* ===== Top header ===== */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
          {/* Brand cluster → /dashboard. Standard harbor-vocabulary
              pattern: "Stone Harbor" reads as the breadcrumb root and
              always points at /dashboard, the room hub. On dashboard
              itself this is a self-link (no-op navigation, harmless). */}
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            aria-label="Stone Harbor — Dashboard"
          >
            <AnchorMark size={32} />
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-primary)]`}
            >
              Stone Harbor
            </span>
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
            >
              Home
            </span>
          </Link>

          {/* Right-side nav — account-level ONLY (Edit profile · Sign
              out). Journal and Messages used to live here too but
              moved into the Other Rooms carousel below; every PLACE
              in the app is a "room" and every room lives in the
              cards. The top nav becomes purely account management. */}
          <nav className="flex items-center gap-6">
            <Link
              href="/welcome"
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
            >
              {c.nav.editProfile}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              style={{ outline: "none", outlineOffset: 0 }}
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
            >
              {c.nav.logout}
            </button>
          </nav>
        </header>

        {/* ===== Anchor strip — the day's greeting reads here =====
            Mirroring /journal's "Today's prompt" strip, but the
            content is the day-aware PersonalizedGreeting. Members
            land on the dashboard and see "Welcome back, [name]" or
            the appropriate days-since-last-visit line as the first
            literary moment. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-5">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {c.anchor.eyebrow}
          </p>
          <div className="mt-2 max-w-[720px]">
            <PersonalizedGreeting
              name={profile?.display_name || profile?.username || null}
              userId={userId}
            />
          </div>
        </section>

        {/* ===== Main scrollable content =====
            Single column scroll: Recognition + Offering bands, then
            horizon mark, then Other Rooms. The whole document scrolls
            within this main element so all content is accessible.
            Crisis footer (rendered at body level by the root layout)
            stays permanently visible at the bottom of the viewport
            because the outer page wrapper uses h-full overflow-hidden. */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          <div className="mx-auto flex max-w-[720px] flex-col px-10 pt-10">
            {/* ───── Acknowledgment card (seasonal / birthday) ─────
                Animated in/out via AnimatePresence so dismissal feels
                intentional. Visual treatment ported from production
                dashboard — left gold bar, tinted card, dismissible. */}
            <AnimatePresence>
              {acknowledgment && (
                <motion.section
                  key={acknowledgment.key}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className={`relative mb-8 overflow-hidden border border-l-[3px] px-6 py-6 ${
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
                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center text-[var(--sh-text-muted)] transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                  <div className="pr-8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
                      {acknowledgment.eyebrow}
                    </p>
                    <p
                      className={`${serif.className} mt-3 text-2xl italic leading-[1.2] text-[var(--sh-text-primary)]`}
                    >
                      {acknowledgment.headline}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                      {acknowledgment.body}
                    </p>
                    <button
                      type="button"
                      disabled={ackDismissing}
                      onClick={() => dismissAcknowledgment(true)}
                      className="mt-4 text-[10px] text-[var(--sh-text-tertiary)] underline-offset-4 transition hover:text-[var(--sh-accent-gold)] hover:underline disabled:opacity-50"
                    >
                      {c.acknowledgment.dontShowAgain}
                    </button>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* ───── Notification card (1 slot max) ───── */}
            {topNotification && (
              <motion.section
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
                className={`mb-8 border border-l-[3px] px-5 py-4 ${
                  isDusk
                    ? "border-white/10 bg-black/25 backdrop-blur-md"
                    : "border-stone-200 bg-white/60 backdrop-blur-sm"
                }`}
                style={{ borderLeftColor: MOSS }}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed text-[var(--sh-text-secondary)]">
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

            {/* ───── Tonight's intention ─────
                TodayIntention stays at column-width because it's the
                quiet personal writing prompt. The Story to tell card
                renders OUTSIDE this column (below) at a wider
                max-w-[920px] so it reads as the day's feature panel
                instead of just another card in the stack. */}
            {userId && (
              <div className="mb-12">
                <TodayIntention userId={userId} />
              </div>
            )}

            {/* ───── Small thing (day 75+, cadenced) ───── */}
            {showSmallThing && userId && (
              <div className="mb-12">
                <SmallThing userId={userId} />
              </div>
            )}
          </div>

          {/* ───── A story to tell (FEATURE PANEL) ─────
              Lives OUTSIDE the max-w-[720px] column at max-w-[920px]
              so it breaks the reading width to become the day's
              feature. The personal cards above (acknowledgment,
              notification, intention, small thing) are column-width
              because they're personal-tier; the Story to tell is
              tonight's deliberate invitation and earns more presence.
              StoryInvitationCard self-hides when no eligible prompt
              is available — on those days the page composes without
              this band. */}
          {userId && (
            <div className="mx-auto mb-14 max-w-[920px] px-10">
              <StoryInvitationCard
                userId={userId}
                userEmail={profile?.email ?? null}
              />
            </div>
          )}

          {/* ───── Horizon mark — the day's recognition closes here ─────
              Mirrors the journal's compact horizon: engraved gold
              segments tapered with SVG lens paths, breathing anchor at
              center, "The harbor is patient." voice signature below.
              Visually marks the boundary between today's personal
              content and the navigation to the other rooms below. */}
          <CenteredHorizonMark />

          {/* ───── Other Rooms — horizontal carousel ─────
              The dashboard's "archive" equivalent of journal's entries
              strip. Same compact-card vocabulary, same horizontal
              layout, same below-the-horizon position. Each card is a
              navigation destination; state badges accent the cards
              that have state (TheMap shows "Begin" / "Continue" / etc.,
              Lineage shows "First door" on first visit).
              overflow-x-auto handles narrower viewports gracefully. */}
          {userId && (
            <RoomsCarousel
              locale={locale}
              lineageUnlocked={lineageUnlocked}
              lineageDoorSeenAt={lineageDoorSeenAt}
              meditationCopy={c.meditation}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Centered horizon mark (compact, theme-aware, breathing).
// ============================================================================
//
// Identical pattern to the journal's CenteredHorizonMark — engraved
// gold lens-shaped segments + breathing anchor at center + voice
// signature below. Kept inline here for now; once it's shared between
// /journal and /dashboard (and eventually /vent etc.) it should be
// extracted into a single component in app/components/.

function CenteredHorizonMark() {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldHex = theme === "sunlit" ? "#a9793d" : "#c4934e";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center pb-3 pt-8">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <HorizonSegment
          direction="left"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill={goldHex} />
        </motion.div>
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
      <p
        className={`${serif.className} mt-3 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        The harbor is patient.
      </p>
    </div>
  );
}

function HorizonSegment({
  direction,
  goldRgb,
  lineAlphaInner,
  lineAlphaMid,
  filter,
}: {
  direction: "left" | "right";
  goldRgb: string;
  lineAlphaInner: number;
  lineAlphaMid: number;
  filter: string;
}) {
  const reactId = useId();
  const gradId = `horizon-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      className="h-1.5 flex-1"
      style={{
        filter,
        transform: direction === "right" ? "scaleX(-1)" : undefined,
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="100%" y2="0">
          <stop offset="0%" stopColor={`rgba(${goldRgb},0)`} />
          <stop
            offset="22%"
            stopColor={`rgba(${goldRgb},${lineAlphaMid * 0.6})`}
          />
          <stop
            offset="55%"
            stopColor={`rgba(${goldRgb},${lineAlphaMid})`}
          />
          <stop
            offset="88%"
            stopColor={`rgba(${goldRgb},${lineAlphaInner})`}
          />
          <stop
            offset="100%"
            stopColor={`rgba(${goldRgb},${lineAlphaInner})`}
          />
        </linearGradient>
      </defs>
      <path
        d="M 0 3 Q 30 0.6 100 1.4 L 100 4.6 Q 30 5.4 0 3 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

// ============================================================================
// RoomCard — compact horizontal card for the Other Rooms carousel.
// ============================================================================
//
// Uniform 260px × ~150px tiles. Three lines of content + an arrow CTA:
//   - small gold eyebrow at the top (the room's category)
//   - serif italic name (the room's specific door)
//   - small tertiary tagline
// Optional `accent` shows a tiny chip next to the eyebrow for state
// info ("Begin", "Continue", "First door", etc.). The highlighted
// card shows hairlines + bg-tint together — same engraved-gold
// vocabulary the journal EntryStripCard uses for active. The
// RoomsCarousel below drives which card is highlighted via mouse
// position.

/**
 * RoomsCarousel — the horizontal strip of room cards below the
 * horizon mark.
 *
 * Default-highlight + cursor-following pattern:
 *   - Journal sits at the center index of the array (Messages,
 *     The Map, Journal, Rhythm, [Lineage], The Breath).
 *   - Journal is the default highlighted card. Its hairlines + bg-tint
 *     appear without any user interaction.
 *   - When the cursor enters another card, the highlight MOVES to
 *     that card — its hairlines fade in, Journal's fade out.
 *   - When the cursor leaves the strip entirely, the highlight
 *     snaps back to Journal as the default.
 *
 * Reads as: "this is the default destination; let me show you the
 * others." Visually it's the harbor's attention following the
 * member's, returning to base when the member isn't pointing.
 */
function RoomsCarousel({
  locale,
  lineageUnlocked,
  lineageDoorSeenAt,
  meditationCopy,
}: {
  locale: "en" | "es";
  lineageUnlocked: boolean;
  lineageDoorSeenAt: string | null;
  meditationCopy: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
  };
}) {
  // Build the rooms array with Journal at the center index.
  // 5 cards (no Lineage): Messages, The Map, Journal, Rhythm, The Breath
  //   → Journal at index 2 (exact center)
  // 6 cards (Lineage):   Messages, The Map, Journal, Rhythm, Lineage, The Breath
  //   → Journal at index 2 (slightly left of center)
  type Room = {
    key: string;
    href: string;
    eyebrow: string;
    name: string;
    tagline: string;
    accent?: string | null;
  };

  const rooms: Room[] = [
    {
      key: "vent",
      href: "/vent",
      eyebrow: locale === "es" ? "Desahogo" : "Vent",
      name: locale === "es" ? "Sácalo" : "Let it out",
      tagline:
        locale === "es" ? "Dicho una vez. Listo." : "Said once. Done.",
    },
    {
      key: "messages",
      href: "/messages",
      eyebrow: locale === "es" ? "Mensajes" : "Messages",
      name: locale === "es" ? "Tu puerto" : "Your harbor",
      tagline:
        locale === "es"
          ? "Conexión sin actuación."
          : "Connection without performance.",
    },
    {
      key: "map",
      // /map lives at app/[locale]/map/page.tsx — a Phase 1 route that
      // requires the locale segment in the URL. Bare /map doesn't
      // resolve (it isn't in PHASE_2_PAGES, and Next.js can't match
      // [locale]/page.tsx because "map" isn't a configured locale).
      // Always emit the locale-prefixed path.
      href: `/${locale}/map`,
      eyebrow: locale === "es" ? "El Mapa" : "The Map",
      name: locale === "es" ? "Tu Manual" : "Operating Manual",
      tagline:
        locale === "es" ? "Cinco perspectivas." : "Five perspectives.",
    },
    {
      key: "journal",
      href: "/journal",
      eyebrow: locale === "es" ? "Diario" : "Journal",
      name: locale === "es" ? "Tu escritura" : "Today's writing",
      tagline:
        locale === "es"
          ? "Nota lo que está aquí."
          : "Notice what's here.",
    },
    {
      key: "rhythm",
      // /rhythm lives at app/[locale]/rhythm/page.tsx — Phase 1 route
      // same as /map. Bare /rhythm doesn't resolve. Always emit the
      // locale-prefixed path.
      href: `/${locale}/rhythm`,
      eyebrow: locale === "es" ? "Ritmo" : "Rhythm",
      name: locale === "es" ? "Espejo circadiano" : "Circadian mirror",
      tagline:
        locale === "es" ? "Lo que tu día dice." : "What your day says.",
    },
    {
      key: "lineage",
      // /lineage is the dedicated Phase 2 surface (app/lineage/page.tsx),
      // built 2026-06-17. Same three prompts as the LineageSection
      // inside /welcome, wrapped in harbor-vocabulary chrome so the
      // weight of these questions gets the room they deserve instead
      // of dropping the member onto a long profile-editing form. The
      // section's data still lives in the same DB columns
      // (profiles.lineage_*), so /welcome's existing LineageSection
      // continues to read/write the same content.
      href: "/lineage",
      eyebrow: locale === "es" ? "Linaje" : "Lineage",
      name: locale === "es" ? "Los que cruzaron" : "Those who crossed",
      tagline:
        locale === "es" ? "Sabiduría de antes." : "Wisdom from before.",
      // "First door" accent only when (a) the lineage door has never
      // been seen AND (b) Lineage is actually unlocked. Locked members
      // see a clean card with no progression hint — the destination
      // page handles the "not yet" messaging if they navigate there.
      accent:
        lineageUnlocked && !lineageDoorSeenAt
          ? locale === "es"
            ? "Primera puerta"
            : "First door"
          : null,
    },
    {
      key: "breath",
      href: "/meditation",
      eyebrow: meditationCopy.eyebrow,
      name:
        locale === "es" ? "Siéntate" : "Sit with the breath",
      tagline:
        locale === "es"
          ? "Unos minutos sin prisa."
          : "A few unhurried minutes.",
    },
  ];

  const defaultIdx = rooms.findIndex((r) => r.key === "journal");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const highlightedIdx = hoveredIdx ?? defaultIdx;

  return (
    // Section width matches the journal's entries-strip section: wide
    // enough that the inner row can reach its max-w-[1200px] without
    // the section's padding squeezing it. The row itself has the
    // max-w cap; the section just gives it room.
    <section className="mx-auto max-w-[1440px] px-10 pb-16">
      <div
        className="mx-auto flex w-full max-w-[1200px] justify-center gap-3 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* The visible cards center as one balanced group via
            justify-center on the parent row. Journal stays the
            default-highlighted card regardless of its exact pixel
            position — its default highlight is found by findIndex on
            the rooms array, not by geometric center. When Lineage
            unlocks at day 90, the row gains a 7th card and Journal
            naturally moves to the exact center. */}
        {rooms.map((room, i) => (
          <RoomCard
            key={room.key}
            href={room.href}
            eyebrow={room.eyebrow}
            name={room.name}
            tagline={room.tagline}
            accent={room.accent}
            isHighlighted={highlightedIdx === i}
            onHover={() => setHoveredIdx(i)}
          />
        ))}
      </div>
    </section>
  );
}

function RoomCard({
  href,
  eyebrow,
  name,
  tagline,
  accent,
  isHighlighted,
  onHover,
}: {
  href: string;
  /** Small uppercase eyebrow at top — the room's category. */
  eyebrow: string;
  /** Serif name — the room's specific door. */
  name: string;
  /** Quiet preview line below the name. */
  tagline: string;
  /** Optional second uppercase line below the eyebrow — state hint
   *  like "Begin", "Continue", "First door". */
  accent?: string | null;
  /** True when this card is the "current highlight" — either the
   *  default (Journal at center) or the one the cursor is currently
   *  over. Drives hairlines + bg-tint visibility. */
  isHighlighted: boolean;
  /** Fired when the cursor enters this card; RoomsCarousel uses it
   *  to update which card is highlighted. */
  onHover: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Link
      href={href}
      onMouseEnter={onHover}
      style={{
        outline: "none",
        outlineOffset: 0,
        width: "160px",
        height: "116px",
      }}
      // Visual parity with the journal's EntryStripCard:
      //   - Fixed 160px × 116px footprint (same as journal entry cards)
      //   - flex-col gap-1, px-3.5 py-3 (identical padding/rhythm)
      //   - No border — the card is a quiet rectangle of bg
      //   - Subtle bg-tint (bg-white/[0.02]) when isHighlighted
      //   - relative so the absolutely-positioned hairlines anchor here
      // bg-tint and hairlines are driven by isHighlighted (set by the
      // parent RoomsCarousel based on cursor position or default).
      className={`relative flex flex-shrink-0 flex-col gap-1 px-3.5 py-3 transition-colors ${
        isHighlighted ? "bg-white/[0.02]" : ""
      }`}
    >
      {/* Engraved-gold lens hairlines — visible when isHighlighted.
          Identical shape and theme treatment to the journal's
          EntryStripCard active state. Fade in/out via opacity
          transition so the "highlight moves" effect across cards
          reads as one smooth crossfade. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          isHighlighted ? "opacity-100" : "opacity-0"
        }`}
      >
        <RoomCardHairline position="top" theme={theme} />
        <RoomCardHairline position="bottom" theme={theme} />
      </div>

      {/* Row 1 — gold dot + uppercase eyebrow. Maps 1:1 to the
          journal entry card's "● TODAY" mood-dot + date stamp.
          Uniform gold-deep dot here (rooms have no mood-equivalent
          to tint the dot with). */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "#a9793d" }}
        />
        <span
          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
        >
          {eyebrow}
        </span>
      </div>

      {/* Row 2 — optional accent label. Maps to the journal entry
          card's mood label. Renders only when present so cards
          without a state hint sit tighter. */}
      {accent && (
        <span
          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
        >
          {accent}
        </span>
      )}

      {/* Name — serif normal (not italic), single-line truncate.
          Maps to the journal entry card's title. */}
      <p
        className={`${serif.className} truncate text-[14px] font-medium leading-[1.25] tracking-[-0.005em] text-[var(--sh-text-primary)]`}
      >
        {name}
      </p>

      {/* Tagline — sans, two-line clamp. Maps to the journal entry
          card's preview snippet. */}
      <p
        className={`${sans.className} line-clamp-2 text-[10px] leading-[1.5] text-[var(--sh-text-secondary)]`}
      >
        {tagline}
      </p>
    </Link>
  );
}

/**
 * RoomCardHairline — the engraved-gold lens shape used to mark a
 * hovered RoomCard. Identical geometry + theme-aware treatment to the
 * journal EntryStripCard's HairlineLens. Inlined here for now; once
 * we extract the journal version into a shared component, both can
 * import from one source.
 */
function RoomCardHairline({
  position,
  theme,
}: {
  position: "top" | "bottom";
  theme: "sunlit" | "dusk";
}) {
  const reactId = useId();
  const gradId = `sh-room-hairline-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const rgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const filter =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.45)) drop-shadow(0 0 8px rgba(196,147,78,0.20))";

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute left-1/2 h-1 w-[88%] -translate-x-1/2 ${
        position === "top" ? "top-0" : "bottom-0"
      }`}
      style={{ filter }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="100%" y2="0">
          <stop offset="0%" stopColor={`rgba(${rgb},0)`} />
          <stop offset="22%" stopColor={`rgba(${rgb},0.38)`} />
          <stop offset="50%" stopColor={`rgba(${rgb},0.95)`} />
          <stop offset="78%" stopColor={`rgba(${rgb},0.38)`} />
          <stop offset="100%" stopColor={`rgba(${rgb},0)`} />
        </linearGradient>
      </defs>
      <path
        d="M 0 3 Q 50 0.4 100 3 Q 50 5.6 0 3 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
}

// ============================================================================
// Notification copy — ported from /dashboard.
// ============================================================================

function formatNotificationCopy(
  n: Notification,
  locale: "en" | "es",
): string {
  // Minimal bilingual rendering — matches the production dashboard's
  // hedged copy patterns for the four notification kinds. The actual
  // kind→message mapping lives in the production dashboard; for the
  // preview we render a quiet generic fallback when an unknown kind
  // arrives so nothing crashes.
  const kind = n.kind;
  if (kind === "solidarity_threshold") {
    return locale === "es"
      ? "Algo se movió en el puerto."
      : "Something moved in the harbor.";
  }
  if (kind === "daily_solidarity_summary") {
    return locale === "es"
      ? "Otros estuvieron aquí hoy."
      : "Others were here today.";
  }
  if (kind === "warning_issued") {
    return locale === "es"
      ? "Hay una nota para ti."
      : "There's a note for you.";
  }
  if (kind === "suspension_lifted") {
    return locale === "es"
      ? "Bienvenido de vuelta."
      : "Welcome back.";
  }
  return locale === "es" ? "Algo nuevo." : "Something new.";
}