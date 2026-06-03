"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Volume2, VolumeX } from "lucide-react";
import { serif, sans } from "@/lib/fonts";
import { supabase } from "@/lib/supabaseClient";
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
 * Stone Harbor — Meditation page.
 *
 * A separate, full-screen sanctuary the member can step into from the
 * dashboard "Daily Breath" tile. Dark cinematic backdrop with rotating
 * nature imagery (the same RotatingNatureBackdrop component used on
 * the home / login / dashboard surfaces), a continuous 4s/4s box-breath
 * cycle on a central circle, and the same shimmering breeze ambient
 * audio loop used on /start-here.
 *
 * Why a dedicated page rather than a modal:
 *   - Members on phones (especially in the PWA) appreciate full-screen
 *     focus for a grounding practice. A modal layered over the
 *     dashboard would still let notification chrome and the bottom
 *     tab bar steal attention.
 *   - The route URL also means they can bookmark or pin it to home
 *     screen as its own icon — "Stone Harbor: Breath."
 *
 * Therapeutic design notes:
 *   - Audio defaults OFF. Members in a coffee shop or office should
 *     never get blasted on tab open. Single tap to start.
 *   - No "completion" state, no celebration, no timer. The 60-second
 *     ring on the home page was for first-time visitors; here the
 *     member chose to enter, so we trust them to leave when ready.
 *   - Back arrow at the top-left returns to /dashboard. ESC also exits
 *     for keyboard users.
 */

const BREATH_IMAGES = [
  // New curated Unsplash photographs — populated by
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

  // Fetch created_at on mount so we can decide whether to show the
  // Long Exhale toggle. Failing silently keeps the page usable even
  // if the member is offline or unauthenticated (the box cycle still
  // works without any account data).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase
        .from("profiles")
        .select("created_at")
        .eq("id", user.id)
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

      {/* TOP BAR — back to dashboard + sound toggle */}
      <header className="relative z-20 flex items-center justify-between px-4 py-4 md:px-10 md:py-6">
        <Link
          href="/dashboard"
          aria-label={t("aria.back")}
          title={t("aria.back")}
          className="group flex items-center gap-2 text-[#c4934e] transition hover:text-white"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span className="hidden text-xs font-bold uppercase tracking-[0.22em] md:inline">
            {t("back")}
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

      {/* CENTER — breath circle */}
      <section className="relative z-20 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.4em] text-white/65 md:mb-6 md:text-xs">
          {t("eyebrow")}
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
                  ? "text-[#c4934e]"
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
                  ? "text-[#c4934e]"
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
      </section>
    </main>
  );
}
