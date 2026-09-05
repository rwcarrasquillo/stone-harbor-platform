"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { requireActiveSession } from "@/lib/authGuards";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import {
  Edit as EditIcon,
  Logout,
  Message,
} from "@/app/components/icons";
import { ChevronRight, X } from "lucide-react";
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
import { HairlineLens } from "@/app/components/hairlineLens";
import { HorizonSegment } from "@/app/components/horizonSegment";
import { PersonalizedGreeting } from "@/app/components/personalizedGreeting";
import { TodayIntention } from "@/app/components/todayIntention";
import { TodaysInvitation } from "@/app/components/todaysInvitation";
import { StoryInvitationCard } from "@/app/components/storyInvitationCard";
import { CurrentStepPanel } from "@/app/dashboard/components/currentStepPanel";
import { PracticeCard } from "@/app/dashboard/components/practiceCard";
import { ReturnCard } from "@/app/dashboard/components/returnCard";
import { CardSkeleton } from "@/app/components/cardSkeleton";
import {
  dismissalKey,
  resolveActiveAcknowledgment,
  type Acknowledgment,
} from "@/lib/seasonalAcknowledgments";
import {
  getPracticeEnabled,
  getPracticeShape,
  getReturnCardEligibility,
  hasDeclaredShape,
  type PracticeShape,
} from "@/lib/practice";
import {
  findNextStep,
  getAllSteps,
  getSpineEnabled,
  getStepById,
  type RoadmapStep,
} from "@/lib/spine";

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
 *   - Rooms catalog — 10 RoomCards in one horizontal row:
 *     Vent · Roadmap · Messages · The Map · JOURNAL · Letters ·
 *     Resources · Rhythm · Lineage · The Breath. Journal sits at
 *     index 4 (slightly left of geometric center now that the row
 *     has 10 cards instead of 7); engraved-gold lens hairlines +
 *     warm bg-tint appear on Journal by default and follow the
 *     cursor across cards on hover, returning to Journal when the
 *     cursor leaves the strip. The slight off-center position is
 *     intentional — Roadmap, Letters, and Resources were added
 *     2026-06-19 when the MobileTabBar moved to sm:hidden, leaving
 *     tablet + desktop members with no other entry to those three
 *     surfaces.
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
  // cover_url is the member's uploaded profile-cover image. It used to
  // be the portada texture behind the dashboard greeting; SH-142
  // dropped that band (dark scrim under near-black Sunlit text). Kept
  // on the shape because the dashboard's profile read is shared and
  // one unused column is cheaper than a second query shape to
  // maintain — /profile is where this value is actually rendered.
  cover_url: string | null;
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
    brandCrumb: "Home",
    nav: {
      journal: "Journal",
      messages: "Messages",
      editProfile: "Edit profile",
      logout: "Sign out",
    },
    acknowledgment: {
      dismiss: "Dismiss",
      dontShowAgain: "Don't show this again",
      // Per-acknowledgment content keyed by the camelCase slug derived
      // from lib/seasonalAcknowledgments.ts. The library returns its
      // own English strings (kept for backward compat with non-dashboard
      // callers) but the dashboard renders from these so the strings
      // also have Spanish counterparts in COPY.es below. New
      // acknowledgments must add an entry on BOTH locales — TypeScript
      // enforces shape parity via `as const`.
      //
      // Voice: the harbor witnesses a hard day rather than inventorying
      // possible feelings at the member. Concrete sensory anchors
      // (table, room, weight, hands), asymmetric pairings ("the fathers
      // we had / the fathers we became"), and room for the reader to
      // feel without being told what to feel. Each card opens with the
      // day's weight named, lands on a clause that grants permission
      // not to perform, and closes with a presence ("the harbor sees
      // it" / "the harbor is open until it does") rather than advice.
      thanksgiving: {
        eyebrow: "Today",
        headline:
          "However you find yourself at today's table — surrounded, alone, beside an empty chair — the harbor sees you.",
        body: "Gratitude is welcome. Its absence is welcome too. The day asks nothing of you that you cannot give it. Just be in your own life today; that is enough.",
      },
      christmasEve: {
        eyebrow: "Tonight",
        headline:
          "Christmas Eve has its own weight. You do not have to lift it alone.",
        body: "Some men tonight feel everything at once. Some feel nothing where joy was expected. Both are in the harbor. So are you.",
      },
      christmasDay: {
        eyebrow: "Today",
        headline:
          "Whatever this Christmas is for you — bright, hollow, somewhere between — is what it is. You don't have to make it more.",
        body: "Joy is welcome. Its absence is welcome too. You can be in the room with the people, or in the room with yourself. The day will hold you either way.",
      },
      newYearsEve: {
        eyebrow: "Tonight",
        headline:
          "A year is closing tonight. You don't owe it a speech, or a list, or a plan.",
        body: "It is enough to sit with what this year actually was. The small things you carried. The things you got through that nobody else saw. Tomorrow will come without your help. The harbor is open until it does.",
      },
      fathersDay: {
        eyebrow: "Today",
        headline:
          "Today carries a lot for many men. The fathers we had. The fathers we became. The fathers we wished we'd had, then tried to be.",
        body: "Whatever this day stirs in you — pride, grief, longing, anger, a kind of love that doesn't have a clean name — the harbor sees it. You don't have to celebrate. You don't have to fix anything. Just be here today, with whatever comes.",
      },
      birthday: {
        eyebrow: "Today",
        headline:
          "Today is your birthday. The harbor does not need you to feel about it in any particular way.",
        body: "Some years this day is light. Some years it carries a weight nobody else can see. Some years you forget about it until afternoon. Wherever you land today, we notice it with you. That is enough.",
      },
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
    // "Tu refugio" matches the canonical Spanish noun for the
    // Dashboard room established 2026-06-19 (nav.dashboard,
    // nav.backToDashboard, and the dashboard surface copy all use
    // refugio as the personal-shelter framing). The brand crumb is
    // the dashboard saying its own name back at the member, so
    // "Stone Harbor · Tu refugio" reads as "Stone Harbor · Your
    // refuge" — declarative + intimate at the same time.
    brandCrumb: "Tu refugio",
    nav: {
      journal: "Diario",
      messages: "Mensajes",
      editProfile: "Editar perfil",
      logout: "Cerrar sesión",
    },
    acknowledgment: {
      dismiss: "Descartar",
      dontShowAgain: "No mostrar esto otra vez",
      // Spanish acknowledgments — written as parallel literary
      // versions, not translations. Uses harbor vocabulary (dársena,
      // tú not usted) and matches the English's witnessing register:
      // names the day's weight, grants permission not to perform,
      // closes with a presence rather than advice. Each card has the
      // same emotional shape as its English counterpart but reads as
      // natively Spanish prose, not a translated English sentence.
      thanksgiving: {
        eyebrow: "Hoy",
        headline:
          "Como sea que te encuentres hoy junto a la mesa — acompañado, solo, al lado de una silla vacía — la dársena te ve.",
        body: "La gratitud es bienvenida. Su ausencia también. El día no te pide nada que no puedas darle. Solo habita tu propia vida hoy; con eso basta.",
      },
      christmasEve: {
        eyebrow: "Esta noche",
        headline:
          "La víspera de Navidad tiene su propio peso. No tienes que cargarlo tú solo.",
        body: "Hay hombres esta noche que lo sienten todo a la vez. Otros no sienten nada donde se esperaba alegría. Ambos están en la dársena. Tú también.",
      },
      christmasDay: {
        eyebrow: "Hoy",
        headline:
          "Como sea esta Navidad para ti — luminosa, hueca, en algún punto entre las dos — eso es lo que es. No tienes que hacerla más grande.",
        body: "La alegría es bienvenida. Su ausencia también. Puedes estar en la habitación con la gente, o en la habitación contigo mismo. El día te sostendrá de cualquier modo.",
      },
      newYearsEve: {
        eyebrow: "Esta noche",
        headline:
          "Un año se cierra esta noche. No le debes un discurso, ni una lista, ni un plan.",
        body: "Basta con sentarse junto a lo que este año en verdad fue. Las cosas pequeñas que cargaste. Lo que atravesaste y que nadie más vio. El mañana llegará sin tu ayuda. La dársena está abierta hasta entonces.",
      },
      fathersDay: {
        eyebrow: "Hoy",
        headline:
          "Hoy carga con mucho para muchos hombres. Los padres que tuvimos. Los padres en que nos convertimos. Los padres que hubiéramos querido tener, y luego intentamos ser.",
        body: "Lo que este día despierte en ti — orgullo, duelo, nostalgia, ira, una clase de amor que no tiene un nombre limpio — la dársena lo ve. No tienes que celebrar. No tienes que arreglar nada. Solo quédate aquí hoy, con lo que venga.",
      },
      birthday: {
        eyebrow: "Hoy",
        headline:
          "Hoy es tu cumpleaños. La dársena no necesita que sientas nada en particular al respecto.",
        body: "Algunos años este día es ligero. Algunos años carga con un peso que nadie más puede ver. Algunos años se te olvida hasta la tarde. Como sea que te encuentres hoy, lo notamos contigo. Con eso basta.",
      },
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

/**
 * Resolve the locale-specific copy for an acknowledgment.
 *
 * The library `lib/seasonalAcknowledgments.ts` returns acknowledgments
 * with hyphenated keys ('fathers-day', 'christmas-eve') and English
 * `eyebrow`/`headline`/`body` strings. The dashboard COPY constant
 * holds the same content per acknowledgment in BOTH languages, indexed
 * by camelCase slug ('fathersDay', 'christmasEve'). This helper bridges
 * the two — converts the hyphenated library key to camelCase, looks up
 * the localized copy, and falls back to the library's English strings
 * if no localized entry exists (defensive — new acknowledgment keys
 * may land in the library before the COPY is updated, and we'd rather
 * show English than crash).
 */
function localizedAckCopy(
  ackCopy:
    | (typeof COPY)["en"]["acknowledgment"]
    | (typeof COPY)["es"]["acknowledgment"],
  ack: { key: string; eyebrow: string; headline: string; body: string },
): { eyebrow: string; headline: string; body: string } {
  const slug = ack.key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const fromCopy = (
    ackCopy as unknown as Record<
      string,
      { eyebrow?: string; headline?: string; body?: string } | undefined
    >
  )[slug];
  return {
    eyebrow: fromCopy?.eyebrow ?? ack.eyebrow,
    headline: fromCopy?.headline ?? ack.headline,
    body: fromCopy?.body ?? ack.body,
  };
}

/**
 * Dashboard's entrance cascade — the four sections that fade in below
 * the personalized greeting. Each value is the step index passed to
 * `cascadeTransition` (0-indexed) so the first cascade element starts
 * at CASCADE_BASE_DELAY (0.6s) and each subsequent one waits
 * CASCADE_STEP (0.3s) longer. Total reveal lands at ~2.2s.
 *
 * The cascade vocabulary itself (timing constants, fade-up object,
 * helper) lives in `lib/motion.ts` so every member-facing surface
 * uses identical pacing. Only the section-to-step mapping is
 * page-specific.
 */
// SH-123 — these indices are the entrance choreography, and after the
// §3.5 reorder they have to agree with the new reading order or the
// page assembles itself out of sequence: elements would fade in
// bottom-up while the eye travels top-down.
//
// Beat 0 — the current-step panel alone. It is now the first card in
//   the stack and the frame everything below hangs off, so it lands
//   first and by itself.
// Beat 1 — everything the step frames: today's invitation (the
//   harbor's offer), today's intention (the member's answer), and the
//   story card.
// Beats 2, 3 — the closing horizon mark, then the rooms strip.
//
// Still four beats, so the total entrance is the same length it was
// before the reorder.
const CASCADE_STEPS = {
  currentStepPanel: 0,
  todaysInvitation: 1,
  todayIntention: 1,
  storyCard: 1,
  horizonMark: 2,
  roomsStrip: 3,
} as const;

export default function DashboardCenteredPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  const tDash = useTranslations("dashboard");
  const tRooms = useTranslations("dashboardRooms");

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
  // SH-108 — gate the Lighthouse Keepers room card on the feature flag.
  const [keepersEnabled, setKeepersEnabled] = useState(false);
  // SH-109 — the member's place on the path. Both stay null unless
  // spine_enabled is true AND the member has been placed, which is the
  // condition for the current-step panel to render at all.
  const [currentStep, setCurrentStep] = useState<RoadmapStep | null>(null);
  const [nextStep, setNextStep] = useState<RoadmapStep | null>(null);
  // SH-123 — true until the spine read settles, so the step panel can
  // hold its space instead of appearing late and displacing the cards
  // beneath it. Starts true: at first paint the answer is unknown.
  const [spineLoading, setSpineLoading] = useState(true);

  // SH-135 — /practice PR 2. The flag, the member's declared shape, and
  // the return-card gate. All three default to the "render nothing"
  // answer, so the dashboard composes exactly as it does today until
  // the flag is flipped AND the member has a shape.
  const [practiceEnabled, setPracticeEnabled] = useState(false);
  const [practiceShape, setPracticeShape] = useState<PracticeShape | null>(
    null,
  );
  const [returnEligibility, setReturnEligibility] = useState<{
    eligible: boolean;
  } | null>(null);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SH-108 — read app_settings.keepers_enabled (singleton id=1) so the
  // Keepers room card stays hidden until the surface launches.
  useEffect(() => {
    let alive = true;
    void supabase
      .from("app_settings")
      .select("keepers_enabled")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setKeepersEnabled(!!data?.keepers_enabled);
      });
    return () => {
      alive = false;
    };
  }, []);

  // SH-109 — read the spine flag and, when it's on, the member's current
  // step plus the one after it (for the peek-at-next section).
  //
  // Every failure mode here is a no-op: flag off, member not yet placed,
  // a stale step id, RLS blocking the read. The panel simply doesn't
  // render and the dashboard composes as it does today. The spine must
  // never be the reason a member can't reach their rooms.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const enabled = await getSpineEnabled(supabase);
        if (!alive || !enabled) return;

        const { data: row } = await supabase
          .from("profiles")
          .select("current_roadmap_step_id")
          .eq("id", userId)
          .maybeSingle();
        const stepId = row?.current_roadmap_step_id as string | null | undefined;
        if (!alive || !stepId) return;

        const step = await getStepById(supabase, stepId);
        if (!alive || !step) {
          if (alive) {
            console.warn(
              "[dashboard] current_roadmap_step_id doesn't resolve to a step; falling back to the rooms strip.",
            );
          }
          return;
        }
        setCurrentStep(step);

        const allSteps = await getAllSteps(supabase);
        if (!alive) return;
        setNextStep(findNextStep(allSteps, stepId));
      } catch (e) {
        console.warn("[dashboard] spine read failed; rendering without it.", e);
      } finally {
        // SH-123 — every path above, including the early returns for
        // "flag off" and "not placed yet", ends the skeleton. It shows
        // only while the answer is genuinely unknown.
        if (alive) setSpineLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // SH-135 — /practice PR 2. Same client-side shape as the SH-109 spine
  // read above: this dashboard is a "use client" component, so every
  // flag it consults is read here in an effect rather than passed down
  // from a server component.
  //
  // The flag is checked first and short-circuits: with practice_enabled
  // false — its default — this costs exactly one app_settings read and
  // touches profiles not at all.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const enabled = await getPracticeEnabled(supabase);
        if (!alive || !enabled) return;
        setPracticeEnabled(true);

        const [shape, eligibility] = await Promise.all([
          getPracticeShape(supabase, userId),
          getReturnCardEligibility(supabase, userId),
        ]);
        if (!alive) return;
        setPracticeShape(shape);
        setReturnEligibility(eligibility);
      } catch (e) {
        // Same contract as the spine read: /practice must never be the
        // reason a member can't reach their rooms.
        console.warn("[dashboard] practice read failed; rendering without it.", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  async function loadAll() {
    // SH-110 — the shared three-gate gate: signed in, not suspended,
    // settle-in complete. Returns null after firing the right redirect,
    // so there's nothing to handle here beyond bailing out.
    const session = await requireActiveSession();
    if (!session) {
      setUserId(null);
      return;
    }
    const uid = session.id;
    setUserId(uid);

    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        // created_at rides along on the profile read now that the guard
        // no longer hands back a raw Supabase session. The profiles row
        // is created by an AFTER-INSERT trigger in the same transaction
        // as auth.users, so the two timestamps agree — and /profile and
        // /messages already compute their unlock thresholds off this
        // column, so the dashboard now matches them.
        "email, created_at, display_name, username, healing_stage, avatar_url, cover_url, birth_month, birth_day, acknowledge_birthday, seasonal_acknowledgments_enabled, acknowledgments_dismissed, lineage_door_seen_at",
      )
      // The profiles table's PK is `id`, matching auth.users.id 1:1.
      // Every other surface (/messages, /journal, /welcome, /lineage)
      // queries with `.eq("id", user.id)`. The dashboard was using
      // `user_id` — a column that doesn't exist — so profileData was
      // silently null, leaving display_name, avatar_url, healing_stage,
      // birthdays, lineage_door_seen_at all unset. The fallback values
      // (`?? null`, `?? true`, etc.) hid the bug as long as no UI
      // element actually rendered profile data. Caught 2026-06-19
      // when the Edit Profile avatar bubble started showing the
      // AnchorMark fallback for a member who'd uploaded an avatar.
      .eq("id", uid)
      .maybeSingle();

    setUserCreatedAt(
      (profileData as { created_at?: string | null } | null)?.created_at ?? null,
    );

    const loadedProfile: Profile = {
      email: profileData?.email ?? session.email ?? null,
      display_name: profileData?.display_name ?? null,
      username: profileData?.username ?? null,
      healing_stage: profileData?.healing_stage ?? null,
      avatar_url: profileData?.avatar_url ?? null,
      cover_url: profileData?.cover_url ?? null,
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

  // SH-142 — whether Zone 1 has a practice card to introduce.
  //
  // Deliberately the CHEAP half of PracticeCard's own gate: flag on,
  // and a shape with at least one named block. The card additionally
  // hides when the block matching the current hour is the unnamed
  // one, which depends on the browser's timezone and is therefore
  // resolved inside the card after mount — not knowable here without
  // duplicating that state.
  //
  // Over-approximating is the safe direction. It can only leave Zone 1
  // rendering for a member who has a shape but nothing for this hour
  // AND no step on the path, and the .sh-zone :has() rule in
  // globals.css catches that case by hiding a zone holding nothing but
  // its label.
  const practiceMayRender = practiceEnabled && hasDeclaredShape(practiceShape);

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
            // Opt out of the global gold focus ring on the brand
            // crumb — matches the pattern used by every other harbor
            // surface (/journal, /journal/archive, /lineage,
            // /messages, /vent). The brand crumb is the page's "you
            // are here" marker; focusing it doesn't change anything
            // (it links back to /dashboard from /dashboard) and the
            // visible gold rectangle reads as an unintended outline.
            style={{ outline: "none", outlineOffset: 0 }}
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
              {c.brandCrumb}
            </span>
          </Link>

          {/* Right-side nav — account-level ONLY (Edit profile · Sign
              out). Journal and Messages used to live here too but
              moved into the Other Rooms carousel below; every PLACE
              in the app is a "room" and every room lives in the
              cards. The top nav becomes purely account management. */}
          <nav className="flex items-center gap-6">
            {/* Edit profile cluster: small avatar bubble + label,
                both inside one Link so either tap target lands at
                /welcome. Avatar shows the member's uploaded image
                when present, falls back to a small anchor on the
                same warm cream circle the messages Avatar uses, so
                the look is consistent with how the member sees
                themselves represented elsewhere in the harbor. */}
            <Link
              href="/profile"
              style={{ outline: "none", outlineOffset: 0 }}
              className={`${sans.className} group flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
              aria-label={c.nav.editProfile}
            >
              {/* eslint-disable-next-line no-restricted-syntax -- bespoke always-light avatar fill, no token */}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--sh-border-subtle)] bg-[#efe8dc] transition-colors group-hover:border-[var(--sh-accent-gold)]">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <AnchorMark size={12} fill="#a9793d" />
                )}
              </span>
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
              literary moment.

              SH-142 — the portada image band is gone. It carried the
              member's profile cover (falling back to /forest-hero.png)
              under a fixed `from-black/70 via-black/45 to-black/80`
              scrim. That scrim was never theme-conditional, and
              PersonalizedGreeting renders --sh-text-primary, which is
              near-black on Sunlit: dark text on a dark band, every
              morning, for every member on the light theme. Dusk got
              away with it because its text is already light.

              Dropped rather than lightened. A scrim tuned to pass
              contrast in both themes ends up too weak to justify the
              image underneath, and SH-115 already set the rule when
              /journal stopped rendering PageAmbience — a surface a
              member returns to daily is not a hero-imagery moment. The
              greeting now reads on the ambient page background, which
              is the pairing --sh-text-primary was calibrated against.

              `profiles.cover_url` is still selected in loadDashboard;
              it stays in the profile shape for /profile's own use and
              costs one column on a query that already runs. */}
          <section className="flex flex-shrink-0 flex-col items-center px-10 pb-8 pt-8">
            <p
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
            >
              {c.anchor.eyebrow}
            </p>
            {/* Gate the greeting on `profile !== null` so members never
                see the awkward "friend" → "Rafael" flash. Before the
                profile query resolves, the dashboard has no idea what
                name to use; rendering the greeting immediately with
                name=null forces the component to fall back to "friend",
                then re-render once the name arrives. Holding the render
                until the query completes means the greeting fades in
                once, already with the correct salutation. */}
            <div className="mt-2 max-w-[720px]">
              {profile !== null && (
                <PersonalizedGreeting
                  name={profile.display_name || profile.username || null}
                  userId={userId}
                  // SH-123 — drives the tenure-branched recognition line.
                  // Same value the SmallThing and Lineage gates already
                  // read, so no extra query.
                  createdAt={userCreatedAt}
                />
              )}
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
            <AnimatePresence initial={false}>
              {acknowledgment && (
                /*
                 * Two-element structure for clean collapse:
                 *
                 *   Outer motion.div — handles the LAYOUT collapse.
                 *     Animates height (auto ↔ 0), marginBottom (32 ↔ 0),
                 *     opacity (1 ↔ 0), y (0 ↔ -8). Has overflow: hidden
                 *     so the inner section's padding gets clipped as the
                 *     wrapper shrinks. No visual styling of its own —
                 *     no padding, no border, no background.
                 *
                 *   Inner <section> — keeps all the VISUAL styling
                 *     (px/py padding, bg color, radial farol, shadow).
                 *     Doesn't animate. Just sits inside the wrapper.
                 *
                 * Why this split: a single-element animation that puts
                 * height + padding on the SAME element runs into the
                 * "padding doesn't shrink with height" problem — when
                 * height reaches 0, the element still occupies its
                 * padding (24-28px top + bottom), then unmount snaps
                 * those pixels away. By collapsing on an outer wrapper
                 * with no padding, the wrapper's height can truly reach
                 * 0 and the unmount is invisible.
                 *
                 * lg:-mx-[100px] moves to the wrapper so the width
                 * extension is part of the same layout container that
                 * controls collapse — the inner section just fills its
                 * parent's width.
                 *
                 * Duration: 0.8s, same as before. Ease curve is the
                 * harbor's standard cascade easing.
                 */
                <motion.div
                  key={acknowledgment.key}
                  initial={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    height: "auto",
                    marginBottom: 32,
                  }}
                  exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  className="lg:-mx-[100px]"
                  style={{ overflow: "hidden" }}
                >
                <section
                  /*
                   * Width tier: middle ground between the 720px personal
                   * column (notifications, today's intention) and the
                   * 920px "A story to tell" feature card. The wrapper
                   * above handles the lg:-mx-[100px] width extension;
                   * this section just fills its parent's width.
                   *
                   * Mobile + tablet (under lg=1024px): card stays at
                   * column width. The narrower line length is actually
                   * better for prose at small viewports — keeps the
                   * literary cadence (60-70 char line length) readable.
                   *
                   * Desktop (lg+): wrapper's -mx-[100px] extends the
                   * card out 100px on each side past the 640px column
                   * content area, landing at ~840px wide. That earns
                   * visual presence for the literary witness-card
                   * register without rivaling the Story card's primacy
                   * below. Padding bumps to px-8 py-7 so the inner text
                   * doesn't hug the wider container.
                   *
                   * Visual treatment — ported from the dashboard
                   * RoomCard farol + top-only hairline language:
                   *   - The previous 3px gold-deep LEFT bar (notification
                   *     accent semantic) is gone. Replaced with the
                   *     "lintel of a doorway" treatment — a single
                   *     HairlineLens at the top edge — which fits the
                   *     acknowledgment's witnessing function better
                   *     than a notification stripe. The card reads as
                   *     "you've stepped into a moment of recognition,"
                   *     not "you have an unread alert."
                   *   - Background gets a radial-gradient farol anchored
                   *     at top-center (same geometry language as the
                   *     RoomCard but widened — ellipse 60% 180% — to
                   *     cover the larger surface). Reads as a cone of
                   *     warm light falling on the card from above.
                   *   - Sunlit uses a gold-deep tint (visible against
                   *     the cream backdrop); dusk uses a white tint
                   *     (visible against the dark backdrop). The
                   *     RoomCard uses white for both because it's a
                   *     small surface, but at acknowledgment width the
                   *     white-on-cream version is invisible — so we
                   *     theme-switch the gradient color.
                   *   - Drops all 1px borders. The hairline at top +
                   *     shadow + bg-color provide enough structural
                   *     presence on a standalone card. Bordered cards
                   *     are for stripped/repeated patterns (notifications
                   *     list); standalone moments don't need them.
                   */
                  className={`relative overflow-hidden px-6 py-6 lg:px-8 lg:py-7 ${
                    isDusk
                      ? "bg-black/35 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
                      : "bg-[var(--sh-bg-card-tinted)] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
                  }`}
                  style={{
                    backgroundImage: isDusk
                      ? "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.015) 60%, transparent 95%)"
                      : "radial-gradient(ellipse 60% 180% at 50% 0%, rgba(196,147,78,0.10) 0%, rgba(196,147,78,0.05) 30%, rgba(196,147,78,0.02) 60%, transparent 95%)",
                  }}
                >
                  {/* Engraved-gold lens hairline — top only. Same
                      "lintel of a doorway" language as the dashboard
                      RoomCard: the beam reaches the lintel first, the
                      card content opens beneath it. The hairline is
                      always visible here (unlike RoomCard where it
                      gates on hover) because the acknowledgment card
                      IS the highlighted state — it doesn't appear at
                      all unless the day calls for it. */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
                    <HairlineLens position="top" theme={theme} />
                  </div>
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
                    {/* Locale-aware copy: the library returns its English
                        strings, but we render from COPY[locale] so this
                        card respects the member's language. See
                        localizedAckCopy() at the top of this file for
                        the slug conversion and fallback semantics. */}
                    {(() => {
                      const lc = localizedAckCopy(
                        c.acknowledgment,
                        acknowledgment,
                      );
                      return (
                        <>
                          <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]">
                            {lc.eyebrow}
                          </p>
                          <p
                            className={`${serif.className} mt-3 text-2xl italic leading-[1.2] text-[var(--sh-text-primary)]`}
                          >
                            {lc.headline}
                          </p>
                          <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                            {lc.body}
                          </p>
                        </>
                      );
                    })()}
                    <button
                      type="button"
                      disabled={ackDismissing}
                      onClick={() => dismissAcknowledgment(true)}
                      className="mt-4 text-[10px] text-[var(--sh-text-tertiary)] underline-offset-4 transition hover:text-[var(--sh-accent-gold)] hover:underline disabled:opacity-50"
                    >
                      {c.acknowledgment.dontShowAgain}
                    </button>
                  </div>
                </section>
                </motion.div>
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

          </div>

          {/* ───── Current step (SH-109, spine Ship 1) ─────
              Lives OUTSIDE the max-w-[720px] column so it can take the
              840px width tier the acknowledgment card uses on lg+ —
              wide enough to read as the frame the rooms sit inside,
              short of the story card's 920px feature width.
              Absent entirely when the flag is off or the member hasn't
              been placed on the path.

              SH-123 — promoted to the top of the card stack. It used to
              sit BELOW today's intention, which inverted the spine's
              own logic: the step is the frame everything else hangs
              off, so a member met their own writing prompt before they
              were told where they stand. Reading order is now
              where-you-are (step) → what's-offered (invitation) →
              what-you-answer (intention). */}
          {/* ───── Return card (SH-135, /practice PR 2) ─────
              Above the step panel because after five days away this is
              the first thing that should meet him — before the path
              tells him where he stands. Self-hides on every gate: flag
              off, no declared shape, not actually absent, or already
              shown in the last 24 hours.

              SH-142 — stays OUTSIDE Zone 1. It is the rare interrupt
              (five days away, at most once a day), and an interrupt
              that arrives already filed under a heading has stopped
              interrupting. Its own width matches the zone's cards, so
              the column still reads straight down. */}
          <ReturnCard
            practiceEnabled={practiceEnabled}
            eligibility={returnEligibility}
            userId={userId}
          />

          {/* ═════ Zone 1 — YOUR ANCHOR (SH-142) ═════
              Where he stands. The practice block matching this hour,
              then the step he is on.

              Order within the zone is SH-136's and unchanged: the
              thrice-daily action sits above the weeks-cadence context
              so the higher-cadence card is not buried by the lower.

              Both children self-hide, and the zone hides with them —
              see zoneHasContent below. With practice_enabled false the
              zone renders the step panel alone; with the member also
              unplaced it does not render at all, which is the
              pre-SH-142 composition exactly. */}
          {(practiceMayRender || currentStep || spineLoading) && (
            <DashboardZone label={tDash("zones.anchor")}>
              <PracticeCard
                practiceEnabled={practiceEnabled}
                practiceShape={practiceShape}
              />

              {currentStep ? (
                <motion.div
                  {...cascadeFadeUp}
                  transition={cascadeTransition(CASCADE_STEPS.currentStepPanel)}
                  // px-10 on a 920px cap puts the panel's own edges at 840px
                  // on lg+ — the same width the acknowledgment card reaches
                  // via its -mx-[100px] extension off the 720px column.
                  className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]"
                >
                  <CurrentStepPanel currentStep={currentStep} nextStep={nextStep} />
                </motion.div>
              ) : spineLoading ? (
                // Same width tier and margin as the panel it stands in for.
                // Four body rows: the loaded panel carries a title, a
                // description, and the peek-at-next block, so a shorter
                // skeleton would just move the jump rather than remove it.
                <CardSkeleton
                  lines={4}
                  className="mx-auto mb-14 w-full max-w-[720px] px-10 lg:max-w-[920px]"
                />
              ) : null}
            </DashboardZone>
          )}

          {/* ───── Zone divider (SH-142, wrapped SH-143) ─────
              The wrapper mirrors the zone containers' outer geometry
              (mx-auto + w-full + max-w-[920px]) so both are centred by
              the same mechanism rather than two that merely agree. */}
          <div className="mx-auto w-full max-w-[920px]">
            <CenteredHorizonMark variant="divider" />
          </div>

          {/* ═════ Zone 2 — TODAY (SH-142) ═════
              What the harbor is offering. The day's invitation, then
              tonight's story prompt.

              SH-142 moves the story card UP into this zone. It used to
              render below the member's own column, which put a harbor
              offer underneath the member's reply to it — the exact
              inversion the comment on that column (SH-123 §3.5) was
              written to prevent. Grouping by who is speaking puts it
              right. Its own weight is unchanged: same 920px feature
              width, same card. (The collapse-when-idle treatment from
              the mockups is deliberately NOT in this ship.)

              Both children self-hide — TodaysInvitation on Sundays and
              for unplaced members, StoryInvitationCard when no prompt
              is queued — so a quiet day drops the zone entirely rather
              than leaving a titled empty box. */}
          {userId && (
            <DashboardZone label={tDash("zones.today")}>
              <TodaysInvitation
                userId={userId}
                cascadeStep={CASCADE_STEPS.todaysInvitation}
              />

              {/* Lives at max-w-[920px] rather than the zone's inner
                  840px tier so it still breaks the reading width and
                  reads as the day's feature panel. Wrapped in a cascade
                  motion.div whose delay slots it into the dashboard's
                  coordinated entrance sequence; the motion.section
                  inside StoryInvitationCard runs its own quick fade
                  invisibly within this wrapper. */}
              <motion.div
                {...cascadeFadeUp}
                transition={cascadeTransition(CASCADE_STEPS.storyCard)}
                className="mx-auto mb-14 max-w-[920px] px-10"
              >
                <StoryInvitationCard
                  userId={userId}
                  userEmail={profile?.email ?? null}
                />
              </motion.div>
            </DashboardZone>
          )}

          {/* ───── Zone divider (SH-142, wrapped SH-143) ─────
              The wrapper mirrors the zone containers' outer geometry
              (mx-auto + w-full + max-w-[920px]) so both are centred by
              the same mechanism rather than two that merely agree. */}
          <div className="mx-auto w-full max-w-[920px]">
            <CenteredHorizonMark variant="divider" />
          </div>

          {/* ═════ Zone 3 — IF YOU'D LIKE (SH-142) ═════
              The member's own side of the exchange — what he writes
              back. Nothing here is asked of him.

              These two keep the narrower 720px column (640px of text)
              rather than the zone's 840px tier. That was deliberate
              before this ship and stays deliberate: personal-register
              writing gets the shorter measure, and the width itself is
              the cue for whose voice it is. Zone 3's tint is doing the
              grouping work now, so the two cards sitting narrower
              inside it reads as intent rather than drift. */}
          {userId && (
            <DashboardZone label={tDash("zones.ifYouLike")}>
              {/* Each card carries the 720px column on its own wrapper
                  rather than sharing one column div. That makes them
                  direct children of the zone, which is what the
                  `.sh-zone > *` rhythm rules in globals.css key on — a
                  shared wrapper would leave the last card's own
                  bottom margin stranded inside the zone's padding as a
                  block of dead space under the final item. */}
              <motion.div
                {...cascadeFadeUp}
                transition={cascadeTransition(CASCADE_STEPS.todayIntention)}
                className="mx-auto w-full max-w-[720px] px-10"
              >
                <TodayIntention userId={userId} />
              </motion.div>

              {/* ───── Small thing (day 75+, cadenced) ───── */}
              {showSmallThing && (
                <div className="mx-auto w-full max-w-[720px] px-10">
                  <SmallThing userId={userId} />
                </div>
              )}
            </DashboardZone>
          )}

          {/* ───── Horizon mark — the day's recognition closes here ─────
              Mirrors the journal's compact horizon: engraved gold
              segments tapered with SVG lens paths, breathing anchor at
              center, "The harbor is patient." voice signature below.
              Visually marks the boundary between today's personal
              content and the navigation to the other rooms below.
              Wrapped in a cascade motion.div so it joins the entrance
              choreography (delay 1.2s — second to last). */}
          <motion.div
            {...cascadeFadeUp}
            transition={cascadeTransition(CASCADE_STEPS.horizonMark)}
          >
            <CenteredHorizonMark />
          </motion.div>

          {/* ───── Other Rooms — horizontal carousel ─────
              The dashboard's "archive" equivalent of journal's entries
              strip. Same compact-card vocabulary, same horizontal
              layout, same below-the-horizon position. Each card is a
              navigation destination; state badges accent the cards
              that have state (TheMap shows "Begin" / "Continue" / etc.,
              Lineage shows "First door" on first visit).
              overflow-x-auto handles narrower viewports gracefully. */}
          {userId && (
            <motion.div
              {...cascadeFadeUp}
              transition={cascadeTransition(CASCADE_STEPS.roomsStrip)}
            >
              <RoomsCarousel
                locale={locale}
                lineageUnlocked={lineageUnlocked}
                lineageDoorSeenAt={lineageDoorSeenAt}
                meditationCopy={c.meditation}
                keepersEnabled={keepersEnabled}
                practiceEnabled={practiceEnabled}
                // SH-109 — the strip only takes a section header once the
                // member is on a step. Null = no header, which is
                // exactly the pre-spine layout.
                //
                // SH-123 — the label used to read "Rooms available for
                // this step", which promised a filtering the strip does
                // not do: all ten rooms render regardless of which step
                // the member is on. The header now describes what is
                // actually there. The key was renamed too — the old
                // `headerForSpine` implied step-conditional content.
                // If a later ship really does filter rooms by step, the
                // step-aware label can come back and mean it.
                header={currentStep ? tRooms("header") : null}
              />
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Dashboard zone (SH-142).
// ============================================================================
//
// One of the three grouped bands the dashboard's cards sit inside —
// Your anchor / Today / If you'd like. A tinted, rounded container
// with a small gold heading, so a member scanning the page sees three
// groups rather than seven unrelated cards.
//
// Width: max-w-[920px] with NO horizontal padding of its own. The
// cards inside carry `px-10` against the same 920px cap, which is the
// idiom that puts their edges at 840px on lg+. Padding the zone too
// would inset them to 760px and break their alignment with ReturnCard,
// which sits outside the zones at the full 840px. The tint therefore
// bleeds 40px past each card edge, which is what makes it read as a
// container the cards rest in rather than a second card.
//
// Vertical rhythm and the empty-zone case are handled by `.sh-zone` in
// globals.css — see the block comment there for why they can't live on
// these class names.

function DashboardZone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="sh-zone mx-auto mb-8 w-full max-w-[920px] rounded-[10px] py-5"
      style={{ background: "var(--sh-bg-zone)" }}
    >
      <p
        data-sh-zone-label=""
        className={`${sans.className} px-10 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
      >
        {label}
      </p>
      {children}
    </section>
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

function CenteredHorizonMark({
  variant = "closing",
}: {
  /**
   * SH-142 — two registers of the same mark.
   *
   * "closing" (default) is the one that has ended the dashboard since
   * SH-65: full width, breathing, and the "The harbor is patient."
   * voice signature underneath. Unchanged.
   *
   * "divider" is the section transition between zones. Same anchor and
   * the same HorizonSegment hairlines, deliberately quieter — narrower,
   * dimmer, no tagline, no breathing. A section break should register
   * as a held breath, not as the day ending three times on the way
   * down the page.
   */
  variant?: "closing" | "divider";
} = {}) {
  const { theme } = useTheme();
  const isDivider = variant === "divider";
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div
      className={`flex flex-shrink-0 flex-col items-center justify-center ${
        isDivider ? "py-2" : "pb-3 pt-8"
      }`}
    >
      {/* The closing mark breathes; the divider holds still at a lower
          opacity. Animating three of these down one page would turn a
          quiet signature into a pulse the eye keeps catching — and a
          static divider needs no prefers-reduced-motion branch. */}
      <motion.div
        animate={isDivider ? undefined : { opacity: [0.78, 1, 0.78] }}
        transition={
          isDivider
            ? undefined
            : { duration: 4, repeat: Infinity, ease: "easeInOut" }
        }
        style={isDivider ? { opacity: 0.5 } : undefined}
        className={`flex items-center justify-center gap-3 ${
          isDivider ? "w-3/5 max-w-[440px]" : "w-3/4 max-w-[640px]"
        }`}
      >
        <HorizonSegment
          direction="left"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
        <motion.div
          animate={isDivider ? undefined : { scale: [1, 1.04, 1] }}
          transition={
            isDivider
              ? undefined
              : { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark
            size={isDivider ? 12 : 20}
            shaftHeight={isDivider ? 26 : 42}
            fill="var(--sh-accent-gold)"
          />
        </motion.div>
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
      {!isDivider && (
        <p
          className={`${serif.className} mt-3 text-[14px] italic text-[var(--sh-text-tertiary)]`}
        >
          The harbor is patient.
        </p>
      )}
    </div>
  );
}

// HorizonSegment moved to `app/components/horizonSegment.tsx` as part
// of the 2026-06-18 sweep to convert every harbor hairline to CSS.

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
  keepersEnabled,
  practiceEnabled,
  header,
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
  keepersEnabled: boolean;
  practiceEnabled: boolean;
  /**
   * Optional section header above the strip (SH-109). Null — the
   * pre-spine default — renders no header at all, which is how the
   * dashboard has always composed. A string renders the quiet
   * uppercase label that names the strip's relationship to the
   * member's current step.
   */
  header?: string | null;
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
      key: "roadmap",
      // /roadmap is a Phase 2 route (no [locale] segment in the URL).
      // Added to the rooms catalog 2026-06-19 so tablets and desktop
      // users — who lost the MobileTabBar at sm:hidden — have an
      // in-app way to reach the recovery path. Sits between Vent
      // (release) and Messages (connection) because Roadmap is the
      // active-doing pillar of the trio.
      href: "/roadmap",
      eyebrow: locale === "es" ? "Recuperación" : "Recovery",
      name: locale === "es" ? "Tu camino" : "Your path",
      tagline:
        locale === "es"
          ? "Tres etapas. Avanza a tu ritmo."
          : "Three stages. Walk at your pace.",
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
      // /map is a Phase 2 root route (app/map/page.tsx, no locale
      // segment; locale resolves from the NEXT_LOCALE cookie). "map" is
      // in the middleware PHASE_2_PAGES set, so /en/map canonicalizes
      // to /map. Emit the bare path like every other harbor surface.
      href: `/map`,
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
      key: "letters",
      // /letters is the surface URL after the SH-101 rename (2026-07-23);
      // "Letters" is the harbor vocabulary name after the 2026-06-18
      // architectural split that moved external curated content out to
      // /resources. The eyebrow and name echo the surface's own anchor
      // strip ("Letters" / "From the harbor.") so the dashboard card and
      // the destination page read as one breath. Sits to the right of
      // Journal as the first reading room — Stone Harbor's own writing.
      href: "/letters",
      eyebrow: locale === "es" ? "Cartas" : "Letters",
      name: locale === "es" ? "Desde el puerto" : "From the harbor",
      tagline:
        locale === "es" ? "Lo que te escribimos." : "What we wrote you.",
    },
    {
      key: "resources",
      // /resources holds external curated reading after the same split.
      // The sibling reading room to Letters: the team's writing on the
      // left of the pair, the team's curation of others' writing on
      // the right. Echoes the surface's anchor strip ("Curated" /
      // "Reading the team has read first.").
      href: "/resources",
      eyebrow: locale === "es" ? "Curado" : "Curated",
      name:
        locale === "es"
          ? "Lo que el equipo leyó primero"
          : "What we read first",
      tagline:
        locale === "es"
          ? "Vale la pena llevar contigo."
          : "Worth carrying with you.",
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
    // SH-135 — /practice room. Sits immediately after Rhythm: the two
    // are companion time-oriented surfaces (design brief §14.7), one
    // reflecting the shape his days took, one holding the shape he
    // named. Gated on practice_enabled, same spread idiom as Keepers
    // below, so the strip stays at ten cards until the flag flips.
    //
    // Copy note: the strip builds its own bilingual strings inline
    // rather than reading messages/*.json (every one of the ten cards
    // does), so PR 1's practice.rooms.* keys are not consumed here —
    // the Room shape needs three strings and PR 1 shipped two.
    // Flagged for the founder in the PR body.
    ...(practiceEnabled
      ? [
          {
            key: "practice",
            href: "/practice",
            eyebrow: locale === "es" ? "Práctica" : "Practice",
            name:
              locale === "es"
                ? "La forma a la que vuelves"
                : "The shape you return to",
            tagline: locale === "es" ? "Tu forma." : "Your shape.",
          },
        ]
      : []),
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
    // SH-108 — Lighthouse Keepers patron room. Gated on the feature flag
    // (hidden pre-launch). Appended at the end so Journal keeps the center
    // anchor. "Lighthouse Keepers" is a proper noun — English in both
    // locales; only the tagline localizes (brief §7.6). The eyebrow
    // ("Patronage" / "Patrocinio") is not brief-verbatim — flagged for the
    // founder editorial pass.
    ...(keepersEnabled
      ? [
          {
            key: "keepers",
            href: "/keepers",
            eyebrow: locale === "es" ? "Patrocinio" : "Patronage",
            name: "Lighthouse Keepers",
            tagline:
              locale === "es" ? "Sostén la dársena." : "Sustain the harbor.",
          },
        ]
      : []),
  ];

  const defaultIdx = rooms.findIndex((r) => r.key === "journal");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const highlightedIdx = hoveredIdx ?? defaultIdx;

  // Auto-center Journal in the scroll container on mount.
  //
  // Before the 2026-06-19 expansion to 10 rooms, the 7 cards fit
  // exactly inside max-w-[1200px] and `justify-center` made the row
  // sit visually balanced with Journal at the geometric center. With
  // 10 cards the total stride (~1708px) exceeds the container, so
  // `justify-center` would clip cards on BOTH ends. We instead drop
  // `justify-center`, let the row scroll naturally, and use
  // `scrollIntoView({ inline: "center" })` to put Journal in the
  // horizontal middle of the viewport on first paint. Members land
  // on the same view they always had; off-screen rooms are one
  // trackpad swipe away. Card geometry stays at 160×116 so the
  // visual parity with the journal entry strip is preserved.
  //
  // `useLayoutEffect` runs synchronously after DOM mutations but
  // before browser paint, so the centering lands without a flash.
  // `scrollIntoView` is more reliable than a manual `scrollLeft =
  // offsetLeft - ...` calculation — the browser knows the container's
  // actual visible width better than we can compute it from
  // `offsetWidth` (which can include padding, scrollbar gutter, and
  // other browser-specific quirks). `block: "nearest"` prevents any
  // unwanted vertical scroll on the page.
  //
  // SH-123 — the centering is DESKTOP-ONLY now.
  //
  // Verified at a 375px viewport: the strip was never truncated or
  // broken — `overflow-x-auto` has always let it scroll. The real
  // defect was subtler and worse. On a phone the visible window is
  // ~295px, about one and a half cards, and `scrollIntoView` was
  // dropping the member into the MIDDLE of a ten-card row. Vent,
  // Roadmap, Messages and The Map sat off-screen to the LEFT, behind a
  // scroll gesture nobody signals you can make. Rooms were reachable
  // in the sense that a thing at the bottom of a drawer is reachable.
  //
  // Under 640px we leave the strip at scroll position 0, so the row
  // starts where the eye starts and the edge fade below advertises
  // that it continues. 640px matches the `sm:` breakpoint where the
  // mobile tab bar hands over to the desktop layouts.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    if (window.matchMedia("(max-width: 639px)").matches) return;
    const journalCard = container.children[defaultIdx] as
      | HTMLElement
      | undefined;
    if (!journalCard) return;
    // Disable smooth scroll for the initial snap so the centering
    // is instantaneous; the `scroll-smooth` class still applies to
    // later user-initiated scrolls.
    const previousBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = "auto";
    journalCard.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "auto",
    });
    container.style.scrollBehavior = previousBehavior;
  }, [defaultIdx]);

  // Edge fades — the scroll affordance. A hard-cut card at the frame
  // edge reads as a layout bug; a card dissolving into the background
  // reads as "there is more this way." Tracked rather than static so
  // the fade only appears on the side that actually has content
  // hidden, which is what makes it informative instead of decorative.
  //
  // Implemented as a mask on the scroll container rather than a
  // gradient overlay: a gradient would have to know the page's
  // background color, which is theme-dependent (cream on Sunlit,
  // near-black on Dusk) and painted by globals.css on the body rather
  // than by anything this component can read. A mask fades the content
  // itself to transparent and is correct against any backdrop.
  const [edges, setEdges] = useState({ start: false, end: true });
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = container;
      setEdges({
        start: scrollLeft > 4,
        // 4px of slack absorbs sub-pixel rounding at fractional zoom
        // levels, where scrollLeft + clientWidth lands a hair short of
        // scrollWidth even when scrolled fully to the end.
        end: scrollLeft + clientWidth < scrollWidth - 4,
      });
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const maskImage = `linear-gradient(to right, ${
    edges.start ? "transparent 0, #000 32px" : "#000 0"
  }, ${edges.end ? "#000 calc(100% - 32px), transparent 100%" : "#000 100%"})`;

  return (
    // Section width matches the journal's entries-strip section: wide
    // enough that the inner row can reach its max-w-[1200px] without
    // the section's padding squeezing it. The row itself has the
    // max-w cap; the section just gives it room.
    // SH-123 — px-5 under sm. At 375px the old flat px-10 spent 80px of
    // a 375px screen on empty gutters, leaving under two cards visible;
    // px-5 gives that width back to the rooms. Desktop keeps px-10 so
    // the strip still lines up with the rest of the dashboard.
    <section className="mx-auto max-w-[1440px] px-5 pb-16 sm:px-10">
      {header && (
        <p
          className={`${sans.className} mx-auto mb-4 w-full max-w-[1200px] text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
        >
          {header}
        </p>
      )}
      {/* SH-142 — relative wrapper so the chevron below can sit against
          the strip's own right edge rather than the section's padding.
          The width cap moves here; the scroll container fills it. */}
      <div className="relative mx-auto w-full max-w-[1200px]">
        <div
          ref={scrollRef}
          // snap-x + snap-start on each card: a phone swipe now settles
          // with a card flush to the left edge instead of stranding one
          // half-cut mid-frame, which is what made the row look truncated
          // rather than scrollable.
          className="flex w-full snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
          style={{
            scrollbarWidth: "none",
            maskImage,
            WebkitMaskImage: maskImage,
          }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
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

        {/* SH-142 — the chevron half of the scroll affordance.
            The fade was already here and is NOT a gradient overlay:
            it is a mask on the scroll container itself, tracked per
            edge (see the `edges` state above), because a gradient
            would have to know the page background and that is
            theme-dependent. The chevron follows the same rule — it
            renders only while there is actually more to the right, so
            it stays information rather than decoration, and it
            disappears at the end of the row instead of pointing at
            nothing.

            pointer-events-none is load-bearing: this sits over the
            masked strip edge, and a touch swipe starting under it
            must still reach the scroll container. */}
        {edges.end && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[var(--sh-accent-gold)]"
          >
            <ChevronRight size={20} strokeWidth={1.5} />
          </div>
        )}
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
      // Visual parity with the journal's EntryStripCard:
      //   - Fixed 160px × 116px footprint (same as journal entry cards)
      //   - flex-col gap-1, px-3.5 py-3 (identical padding/rhythm)
      //   - No border — the card is a quiet rectangle of bg
      //   - Edge-faded bg-tint when isHighlighted (see below)
      //   - relative so the absolutely-positioned hairlines anchor here
      // bg-tint and hairlines are driven by isHighlighted (set by the
      // parent RoomsCarousel based on cursor position or default).
      //
      // Bg-tint as a "farol" — lighthouse beam falling on the card.
      // The radial gradient is anchored at the TOP center of the card
      // (the source — the lighthouse pointing down at this door) and
      // is narrow horizontally + tall vertically, so the brightness
      // falls off in a cone shape. The card content sits inside the
      // cone of light, illuminated brightest near the top hairline
      // (the "lintel" the beam touches first) and fading downward
      // toward the room.
      //
      // Why the asymmetric ellipse:
      //   ellipse 50% 140% at 50% 0%
      //   horizontal radius 50% of card width (40px on each side
      //   of center) — keeps the beam narrow, like a focused cone
      //   horizontal radius 140% of card height (162px tall) — the
      //   beam extends well past the bottom of the card so the
      //   warmth carries all the way down without an abrupt fade
      //   center at (50%, 0%) — top center of the card, anchored at
      //   the row where the top hairline lives
      //
      // The contour lines of this gradient on a 160×116 card form a
      // narrowing oval extending downward from top center — visually
      // reading as a beam fanning outward as it descends. No hard
      // edges, no rectangle, no symmetric oval. Just a soft cone of
      // light falling on the door.
      className="relative flex flex-shrink-0 snap-start flex-col gap-1 px-3.5 py-3 transition-[background] duration-300"
      style={
        isHighlighted
          ? {
              outline: "none",
              outlineOffset: 0,
              width: "160px",
              height: "116px",
              background:
                "radial-gradient(ellipse 50% 140% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.015) 55%, transparent 95%)",
            }
          : {
              outline: "none",
              outlineOffset: 0,
              width: "160px",
              height: "116px",
            }
      }
    >
      {/* Engraved-gold lens hairline — top only. Visible when
          isHighlighted.
          Note: the journal's EntryStripCard uses top + bottom
          hairlines to read as a contained moment (one entry, one
          held thought). The dashboard rooms are doors, not moments
          — a top hairline alone reads as the lintel of a doorway
          with the room opening below, which fits the "step through
          here" semantic better than a frame. The radial glow below
          carries the eye downward into the destination instead of
          closing it off at a bottom rule. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          isHighlighted ? "opacity-100" : "opacity-0"
        }`}
      >
        <HairlineLens position="top" theme={theme} />
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

// RoomCardHairline replaced with the shared `HairlineLens` from
// `app/components/hairlineLens.tsx` (2026-06-18 CSS sweep). Same
// geometry, identical theme treatment, no pixelation.

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