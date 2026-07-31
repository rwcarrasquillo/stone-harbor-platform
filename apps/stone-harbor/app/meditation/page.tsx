"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { serif, sans } from "@/lib/fonts";
import { supabase } from "@/lib/supabaseClient";
import { requireActiveSession } from "@/lib/authGuards";
import { AnchorMark } from "@/app/components/anchorMark";
import { RotatingNatureBackdrop } from "@/app/components/rotatingNatureBackdrop";
import {
  BREATH_PATTERNS,
  BreathCircle,
  useBreathCycle,
  type BreathPattern,
} from "@/app/components/breathCircle";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";

/**
 * Stone Harbor — Meditation route (production, harbor vocabulary Path C).
 *
 * A full-screen sanctuary the member can step into from the dashboard
 * "Sit with the breath" room. Dark cinematic backdrop with rotating
 * nature imagery (the same RotatingNatureBackdrop component used on
 * /, /login, /dashboard), a continuous box-breath cycle on a central
 * circle, and the same shimmering breeze ambient audio loop used on
 * /start-here.
 *
 * Why a dedicated page rather than a modal:
 *   - Members on phones (especially in the PWA) appreciate full-screen
 *     focus for a grounding practice. A modal layered over the
 *     dashboard would still let notification chrome and the bottom
 *     tab bar steal attention.
 *   - The route URL also means they can bookmark or pin it to home
 *     screen as its own icon — "Stone Harbor: Breath."
 *
 * Therapeutic design notes (UNCHANGED from the pre-vocabulary version):
 *   - Audio defaults OFF. Members in a coffee shop or office should
 *     never get blasted on tab open. Single tap to start.
 *   - No "completion" state, no celebration, no timer. The 60-second
 *     ring on the home page was for first-time visitors; here the
 *     member chose to enter, so we trust them to leave when ready.
 *   - No session log written to the database. The act of meditating
 *     belongs to the man, not to a tracking system.
 *
 * Harbor vocabulary applied (Path C — "hybrid"):
 *   /meditation is the one authenticated surface where full harbor
 *   vocabulary (sunlit/dusk theming, max-w-[720px] reading column,
 *   horizon mark, sessions strip, crisis footer flush at the bottom)
 *   would actively damage what makes the page therapeutic. The
 *   cinematic dark backdrop + rotating nature + central breath circle
 *   + no-tracking-no-completion philosophy stay EXACTLY as they are.
 *   Only the EDGES of the page change to match the harbor breadcrumb
 *   pattern other surfaces use:
 *
 *     1. Top-left: brand crumb (anchor + "Stone Harbor · Breath" →
 *        /dashboard) replacing the bare back arrow. Same shape as
 *        journal/vent/lineage headers, restyled for the dark
 *        cinematic backdrop (white serif + gold anchor, not
 *        theme-aware sunlit/dusk variables).
 *     2. Eyebrow above the breath circle: tightened from "Daily
 *        Breath" to a single imperative word "BREATHE" so it matches
 *        the rhythm of other harbor-vocabulary eyebrows
 *        ("ARCHIVE", "PRIVATE", "LINEAGE"). The original
 *        meditation.eyebrow string is preserved in i18n for any
 *        other surface that uses it (dashboard tile, etc.).
 *     3. Below the practice text: a quiet italic serif voice
 *        signature ("The harbor breathes with you") — same role as
 *        "The harbor is patient." on /journal, with a present-tense
 *        verb that matches the act being performed here.
 *     4. NO inline crisis line. The body-level GlobalCrisisFooter
 *        is already mounted on every authenticated route. Because
 *        this page uses min-h-screen (not h-full), the global
 *        footer sits just below the viewport fold — the cinematic
 *        sanctuary fills the screen and the 988 band is accessible
 *        via scroll. This is the deliberate behavior /meditation
 *        has had since before harbor vocabulary; meditation is
 *        treated as the documented exception to the "crisis footer
 *        always visible" rule used on text-based surfaces.
 *
 * What's INTENTIONALLY NOT here (and why):
 *   - No anchor strip with eyebrow/title at the very top of the page.
 *     The existing centered eyebrow + serif title above the breath
 *     circle already plays that role — moving them to the top would
 *     put text ABOVE the cinematic stage they're framing.
 *   - No horizon mark. It would visually compete with the breath
 *     circle.
 *   - No "Your sessions" strip. The existing design explicitly
 *     rejects session tracking ("members chose to enter, we trust
 *     them to leave"). Adding a sessions strip would require DB
 *     writes + a completion state — both contradict the therapeutic
 *     design.
 *   - No sunlit/dusk theme awareness. /meditation deliberately
 *     breaks theming because the rotating nature photography needs
 *     a dark stage.
 *
 * Tracked under SH-47 (Meditation harbor vocabulary port).
 */

const BREATH_IMAGES = [
  // Curated Unsplash photographs — populated by
  // scripts/fetch-unsplash-nature.mjs. Themes weave dawn lakes,
  // misty forest, and coastal calm for the longest possible viewing.
  "/nature/misty-forest-sunrise-soft-light.jpg",
  "/nature/alpine-lake-trees-mountains.jpg",
  "/nature/sunrise-mountain-lake-icy-rocks.jpg",
  "/nature/misty-forest-warm-sunlight.jpg",
  "/nature/coastal-cliff-serene-sunset.jpg",
  "/nature/lake-mountain-alps.jpg",
  // Legacy fallbacks — these stay until the new images are downloaded.
  "/calm-lake.png",
  "/mountain-dawn.png",
];

export default function MeditationPage() {
  const t = useTranslations("meditation");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  // Account age drives whether the Long Exhale option is visible.
  // Until day 30, only the box cycle exists — the same as before.
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);

  // Which breath pattern the member has chosen for this session.
  // Defaults to box (4s/4s). Long Exhale (4s/7s) is offered after day 30.
  // The choice is in-memory only — we don't persist a preference because
  // the right pattern depends on the day, not on the man's history.
  const [pattern, setPattern] = useState<BreathPattern>(BREATH_PATTERNS.box);
  const { phase: breathPhase, phaseDuration } = useBreathCycle(pattern);

  // SH-110 — page-load gate: signed in, not suspended, settle-in
  // complete. /meditation had no mount gate; the getUser() below is an
  // optional read for the Long Exhale unlock and deliberately fails
  // silently, so it was never gating anything. Adding the guard here
  // brings the room in line with every other member surface.
  //
  // Behavior change worth knowing: a signed-out visitor who lands on
  // /meditation directly now goes to /login instead of getting the
  // box-breath circle anonymously. /meditation is a members-only room
  // (PHASE_2_PAGES, reachable only from the dashboard rooms strip), so
  // that's the intended posture — but it IS a change.
  // SH-114 folds the old separate created_at read into this same
  // effect: the guard is awaited and short-circuited, and the profile
  // read runs only once an active session is confirmed. Previously the
  // guard was fired and forgotten and the created_at query raced it.
  //
  // The created_at read still fails soft — a null just means the Long
  // Exhale toggle stays hidden, never a blocked page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await requireActiveSession();
      if (cancelled || !session) return;
      const { data } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", session.id)
        .single();
      if (!cancelled) setUserCreatedAt(data?.created_at ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const longExhaleUnlocked = isFeatureUnlocked(
    userCreatedAt,
    FEATURE_THRESHOLDS.longExhale,
  );
  const isLongExhale = pattern === BREATH_PATTERNS.longExhale;

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.65;
    audio.loop = true;
    if (soundOn) {
      audio.pause();
      setSoundOn(false);
      return;
    }
    try {
      await audio.play();
      setSoundOn(true);
    } catch {
      // Autoplay blocked or asset missing — silently stay off.
      setSoundOn(false);
    }
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white`}
    >
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      {/* Rotating nature imagery — fills the entire viewport behind everything.
          Slightly higher opacity than the subtle dashboard/login backdrops
          because here the imagery is the WHOLE point. Still grayscale-tinted
          via sepia to harmonize with the dark gold palette. */}
      <RotatingNatureBackdrop
        images={BREATH_IMAGES}
        opacity={0.55}
        rotationMs={16000}
        imageFilter="sepia(0.25) brightness(0.9)"
        className="z-0"
      />

      {/* Dark atmospheric overlay so the breath circle stays legible against
          any of the rotating images. */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/55 via-black/35 to-black/70" />

      {/* Warm dawn glow centered on the breath circle's resting position. */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 55%, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.06) 40%, transparent 75%)",
        }}
      />

      {/* ===== Top header =====
          Brand crumb on the left (replaces the bare back arrow from the
          pre-vocabulary design). Sound toggle on the right (unchanged).
          The crumb uses the same anchor + "Stone Harbor · Breath" pattern
          as journal/vent/lineage, restyled for the dark cinematic
          backdrop:
            - White serif text on the brand name
            - Gold accent only on the anchor itself
            - Hover lifts white → white-bright (no theme-variable lookups)
          This is the ONLY way a member moving from /dashboard rooms into
          meditation experiences the brand continuity, since the rest of
          the page deliberately stays cinematic. */}
      <header className="relative z-20 flex items-center justify-between px-4 py-4 md:px-10 md:py-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-3"
          aria-label="Stone Harbor — Dashboard"
        >
          <AnchorMark size={28} fill="#c4934e" />
          <span
            className={`${serif.className} text-[18px] italic tracking-[-0.012em] text-white transition-colors hover:text-white/85 md:text-[20px]`}
          >
            Stone Harbor
          </span>
          <span className="text-[14px] text-white/40 md:text-[16px]">·</span>
          <span
            className={`${serif.className} text-[18px] italic tracking-[-0.012em] text-white/70 transition-colors hover:text-white/90 md:text-[20px]`}
          >
            {t("brandCrumb")}
          </span>
        </Link>

        <button
          onClick={toggleSound}
          aria-label={soundOn ? t("aria.muteSound") : t("aria.playSound")}
          title={soundOn ? t("aria.muteSound") : t("aria.playSound")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_6px_20px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:scale-110 hover:bg-white/20 md:h-12 md:w-12"
        >
          {soundOn ? (
            <Volume2 className="h-4 w-4 md:h-5 md:w-5" />
          ) : (
            <VolumeX className="h-4 w-4 md:h-5 md:w-5" />
          )}
        </button>
      </header>

      {/* ===== CENTER — breath circle =====
          Centered eyebrow + serif title + breath circle + (gated)
          pattern toggle + guidance text + voice signature. Geometry
          preserved from the pre-vocabulary version; the eyebrow text
          was tightened to a single word ("BREATHE") so it matches the
          rhythm of other harbor-vocabulary eyebrows ("ARCHIVE",
          "PRIVATE", "LINEAGE"). The original "Daily Breath" string
          lives at meditation.eyebrow still — left untouched for any
          other surface that uses it (dashboard tile, etc.). */}
      <section className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold-dusk)] md:mb-6 md:text-[11px]">
          {t("centeredEyebrow")}
        </p>
        <p
          className={`${serif.className} mb-10 text-2xl italic leading-snug text-white md:mb-16 md:text-4xl`}
        >
          {t("stay")}
        </p>

        {/* Shared BreathCircle component — keeps the rhythm and styling
            identical to the home page and the dashboard entry banner.
            phaseDuration is fed from the hook so when the member is on
            Long Exhale (4s in / 7s out), the circle's shrink takes the
            full 7 seconds rather than animating in 4 and then sitting
            still. Visual rhythm matches what the body is doing. */}
        <div className="flex items-center justify-center rounded-full shadow-[0_0_80px_rgba(196,147,78,0.25)]">
          <BreathCircle
            phase={breathPhase}
            size="lg"
            phaseDuration={phaseDuration}
          />
        </div>

        {/* PATTERN TOGGLE — only visible once Long Exhale has unlocked
            (day 30+). Before that the page is identical to its original
            form. The two options sit side by side as quiet text buttons
            with no border drama; the active one is gold, the other dim.
            This is not a settings panel — it's a soft choice between
            two ways of breathing in this moment. */}
        {longExhaleUnlocked && (
          <div className="mt-10 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.3em] md:mt-14">
            <button
              type="button"
              onClick={() => setPattern(BREATH_PATTERNS.box)}
              className={`px-3 py-1 transition ${
                !isLongExhale
                  ? "text-[var(--sh-accent-gold-dusk)]"
                  : "text-white/40 hover:text-white/60"
              }`}
              aria-pressed={!isLongExhale}
            >
              {t("patterns.box")}
            </button>
            <span className="text-white/20">·</span>
            <button
              type="button"
              onClick={() => setPattern(BREATH_PATTERNS.longExhale)}
              className={`px-3 py-1 transition ${
                isLongExhale
                  ? "text-[var(--sh-accent-gold-dusk)]"
                  : "text-white/40 hover:text-white/60"
              }`}
              aria-pressed={isLongExhale}
            >
              {t("patterns.longExhale")}
            </button>
          </div>
        )}

        <p className="mt-6 max-w-md text-xs leading-relaxed text-white/70 md:mt-8 md:text-sm">
          {isLongExhale
            ? t("guidance.longExhale")
            : soundOn
              ? t("guidance.withSound")
              : t("guidance.silence")}
        </p>

        {/* Voice signature — quiet italic serif beneath the practice
            text. Same role as "The harbor is patient." on /journal:
            a single line that tells the member where they are in the
            harbor vocabulary, in Harbor Voice. The present-tense verb
            ("breathes with you") matches the act being performed,
            distinguishing this from journal's patience or archive's
            memory. */}
        <p
          className={`${serif.className} mt-10 text-[13px] italic text-white/55 md:mt-14 md:text-[14px]`}
        >
          {t("voiceSignature")}
        </p>
      </section>

      {/*
        Crisis routing is honored by the body-level GlobalCrisisFooter,
        which is mounted in app/layout.tsx and present on every
        authenticated route. Because this <main> uses min-h-screen
        (not h-full), the global footer sits JUST BELOW the viewport
        fold on the typical desktop — so the cinematic sanctuary fills
        the screen while the 988 band remains accessible via scroll.
        An earlier revision in the centered preview added a duplicate
        inline crisis line at this position and was removed when
        stacked-crisis-footers were caught on smoke test — a useful
        reminder that the harbor vocabulary's "crisis footer always
        visible" rule was set for text-based surfaces (journal/vent/
        lineage) and meditation is the deliberate exception.
      */}
    </main>
  );
}
