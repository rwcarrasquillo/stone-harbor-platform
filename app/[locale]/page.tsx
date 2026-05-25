"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, LogOut, UserPlus, LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { BreathCircle } from "@/app/components/breathCircle";
import { LanguagePicker } from "@/app/components/languagePicker";

import { serif, sans } from "@/lib/fonts";
type JourneyKey = "clarity" | "calm" | "strength";
type PanelProps = {
  children: React.ReactNode;
  bg: string;
  grainId: string;
};

// Two-color discipline: gold for Clarity/Strength, moss for Calm.
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

const journeyOptions: Record<
  JourneyKey,
  {
    label: string;
    title: string;
    identity: string;
    text: string;
    action: string;
    accent: string;
  }
> = {
  clarity: {
    label: "I feel confused",
    title: "Start with clarity.",
    identity: "Become the man who sees clearly.",
    text: "You may still be questioning what happened. Begin by naming patterns, separating facts from emotional noise, and rebuilding trust in your own perception.",
    action: "Start Seeing Clearly",
    accent: GOLD_DEEP,
  },
  calm: {
    label: "I feel overwhelmed",
    title: "Start with calm.",
    identity: "Become the man who is unshakable.",
    text: "Your nervous system may be carrying prolonged stress. Begin with grounding, breath, rest, and emotional regulation.",
    action: "Steady Yourself",
    accent: MOSS,
  },
  strength: {
    label: "I am ready to rebuild",
    title: "Start with strength.",
    identity: "Become the man who rebuilds.",
    text: "You are ready to restore discipline, confidence, boundaries, and identity. The next step is rebuilding your life with structure.",
    action: "Begin Rebuilding",
    accent: GOLD_DEEP,
  },
};

// Storm-mirror keys — the actual strings come from messages/{locale}.json
// so the pain language is editorial per language. Keys stay stable for
// analytics and styling.
const stormMirrorKeys = [
  "divorce",
  "betrayal",
  "burnout",
  "loss",
  "stranger",
] as const;

export default function Home() {
  const t = useTranslations("home");
  const stormMirrors = stormMirrorKeys.map((k) => t(`hero.storms.${k}`));
  const [selectedPath, setSelectedPath] = useState<JourneyKey>("clarity");
  const [memberName, setMemberName] = useState<string | null>(null);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");
  const [newMembersThisWeek, setNewMembersThisWeek] = useState<number>(0);
  const [breathStarted, setBreathStarted] = useState(false);
  const [breathSecondsElapsed, setBreathSecondsElapsed] = useState(0);
  const journeyCarouselRef = useRef<HTMLDivElement>(null);
  const breathSectionRef = useRef<HTMLDivElement>(null);

  const selectedJourney = useMemo(
    () => journeyOptions[selectedPath],
    [selectedPath],
  );

  // 4s in / 4s out box-breath cycle.
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  /**
   * Breath ritual progress.
   *
   * Starts counting only when the breath section comes into view —
   * not on page load. A member who scrolls straight past the hero
   * shouldn't have already burned 30 seconds of their sixty by the
   * time they arrive at the circle.
   *
   * Once started, ticks 0 → 60 seconds and then holds. No reset,
   * no auto-loop. The completion message fades in at 60 and stays.
   * Therapeutic literature on grounding practices favors permission
   * over performance — finishing means finishing, not "lap two."
   */
  useEffect(() => {
    const section = breathSectionRef.current;
    if (!section || breathStarted) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setBreathStarted(true);
      },
      { threshold: 0.5 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [breathStarted]);

  useEffect(() => {
    if (!breathStarted) return;
    if (breathSecondsElapsed >= 60) return;
    const id = setInterval(() => {
      setBreathSecondsElapsed((s) => Math.min(s + 1, 60));
    }, 1000);
    return () => clearInterval(id);
  }, [breathStarted, breathSecondsElapsed]);

  useEffect(() => {
    async function loadMember() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("display_name, username, email")
        .eq("id", user.id)
        .single();
      setMemberName(
        data?.display_name ||
          data?.username ||
          data?.email ||
          user.email ||
          "Member",
      );
    }
    loadMember();
  }, []);

  useEffect(() => {
    supabase.rpc("get_new_members_this_week").then(({ data }) => {
      setNewMembersThisWeek((data as number | null) ?? 0);
    });
  }, []);

  /**
   * Mobile-only: as the journey carousel scrolls, sync the selection
   * to whichever option is most centered. The description card below
   * the carousel updates immediately so swiping feels like browsing
   * the recommendations rather than a static row of buttons.
   *
   * Gated to <md viewport because desktop renders the same buttons as
   * a stacked grid with no horizontal scroll — IntersectionObserver
   * would fire ambiguously when all three are 100% visible at rest.
   *
   * Debounced 100ms so we update once at the end of a flick instead of
   * 60 times during it. Listener is passive so it never blocks scroll.
   */
  useEffect(() => {
    const container = journeyCarouselRef.current;
    if (!container) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    function pickCenteredOption() {
      if (!container) return;
      if (window.innerWidth >= 768) return; // desktop: ignore
      const cRect = container.getBoundingClientRect();
      const cCenter = cRect.left + cRect.width / 2;
      let bestKey: JourneyKey | null = null;
      let bestDistance = Infinity;

      Array.from(container.children).forEach((child) => {
        const el = child as HTMLElement;
        const key = el.dataset.option as JourneyKey | undefined;
        if (!key) return;
        const r = el.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const distance = Math.abs(center - cCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestKey = key;
        }
      });

      if (bestKey) setSelectedPath(bestKey);
    }

    function onScroll() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(pickCenteredOption, 100);
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      container.removeEventListener("scroll", onScroll);
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-900`}
    >
      {/* Base dark layer */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      {/* Slow-drifting forest */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          x: ["0%", "-1.5%", "0%"],
          y: ["0%", "1.5%", "0%"],
        }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-45 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      {/* Atmospheric overlay */}
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/35 to-black/80" />

      {/* Dawn light — warm focal point at lower-center of the hero */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 70%, rgba(196,147,78,0.22) 0%, rgba(196,147,78,0.08) 35%, transparent 70%)",
        }}
      />

      {/* Topographic contour overlay — replaces the tech-y grid */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
            <path
              d="M0 270 Q 80 240 160 270 T 320 270"
              fill="none"
              stroke="white"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#contour)" />
      </svg>

      {/* Film grain — gives the dark side soul */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06] mix-blend-overlay"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="film-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>

      {/* Vertical edge guides — decorative framing only.
          Hidden below xl: on smaller screens the content sits closer to the
          viewport edges and the lines can clip through buttons. On wide
          desktops they sit at the very edge (8px in), well outside any
          content padding, so no overlap is possible. */}
      <div className="pointer-events-none fixed left-2 top-0 z-10 hidden h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent xl:block" />
      <div className="pointer-events-none fixed right-2 top-0 z-10 hidden h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent xl:block" />

      {/* HEADER */}
      <header className="fixed left-0 top-0 z-50 w-full border-b border-stone-300 bg-[#f3efe7] shadow-[0_18px_60px_rgba(0,0,0,0.15)]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6 md:py-6">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-base font-semibold uppercase tracking-[0.22em] text-[#c4934e] md:text-xl md:tracking-[0.28em]">
              Stone Harbor
            </span>
            <span className="mt-2 hidden text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#c4934e] md:block">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <div className="hidden gap-10 text-sm font-bold uppercase tracking-[0.22em] text-stone-700 md:flex">
            <Link href="/start-here" className="transition hover:text-[#c4934e]">
              {t("nav.start")}
            </Link>
            <Link href="/roadmap" className="transition hover:text-[#c4934e]">
              {t("nav.roadmap")}
            </Link>
            <Link href="/resources" className="transition hover:text-[#c4934e]">
              {t("nav.resources")}
            </Link>
            <Link href="/about" className="transition hover:text-[#c4934e]">
              {t("nav.about")}
            </Link>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2 md:gap-3">
              {memberName ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Log out"
                  className="rounded-none border border-[#c4934e] p-2 text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558] md:px-4 md:py-2"
                >
                  <LogOut size={18} className="md:hidden" aria-hidden="true" />
                  <span className="hidden text-xs font-bold uppercase tracking-[0.2em] md:inline">
                    {t("nav.logout")}
                  </span>
                </button>
              ) : (
                <Link
                  href="/login"
                  aria-label="Log in"
                  className="rounded-none border border-[#c4934e] p-2 text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558] md:px-4 md:py-2"
                >
                  <LogIn size={18} className="md:hidden" aria-hidden="true" />
                  <span className="hidden text-xs font-bold uppercase tracking-[0.2em] md:inline">
                    {t("nav.login")}
                  </span>
                </Link>
              )}
              <Link
                href={memberName ? "/dashboard" : "/register"}
                aria-label={memberName ? "Open dashboard" : "Join Stone Harbor"}
                className="rounded-none border border-[#c4934e] p-2 text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558] md:px-4 md:py-2"
              >
                {memberName ? (
                  <LayoutDashboard size={18} className="md:hidden" aria-hidden="true" />
                ) : (
                  <UserPlus size={18} className="md:hidden" aria-hidden="true" />
                )}
                <span className="hidden text-xs font-bold uppercase tracking-[0.2em] md:inline">
                  {memberName ? t("nav.dashboard") : t("nav.join")}
                </span>
              </Link>
            </div>
            {memberName && (
              <p className="hidden max-w-[220px] truncate text-right text-xs font-bold uppercase tracking-[0.18em] text-stone-600 md:block">
                {memberName}
              </p>
            )}
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative z-20 px-6 pb-8 pt-16 md:min-h-screen md:pb-20 md:pt-24">
        <div className="mx-auto flex max-w-7xl items-start pt-4 md:min-h-[80vh] md:pt-32">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 35 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className={`${serif.className} max-w-5xl text-5xl font-semibold leading-[0.95] text-white md:text-[8.5rem] md:leading-[0.9]`}
            >
              {t("hero.h1Line1")}
              <br />
              {t("hero.h1Line2")}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              className="mt-5 max-w-xl text-base leading-relaxed text-white md:mt-10 md:text-2xl"
            >
              {t("hero.sub")}
            </motion.p>

            {/* Pain-mirror line — names the specific storm */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className={`${serif.className} mt-5 max-w-2xl text-sm italic leading-relaxed text-white/75 md:mt-8 md:text-xl`}
            >
              {t("hero.mirrorPrefix")}{" "}
              {stormMirrors.map((s, i) => (
                <span key={s}>
                  <span className="text-[#e8c896]">{s}</span>
                  {i < stormMirrors.length - 2
                    ? ", "
                    : i === stormMirrors.length - 2
                      ? ", "
                      : ""}
                </span>
              ))}{" "}
              {t("hero.mirrorSuffix")}
            </motion.p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-5 md:mt-12">
              <Link
                href="/start-here"
                className="group relative overflow-hidden rounded-none border border-white/20 bg-white/[0.06] px-6 py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.12] md:px-10 md:py-5 md:text-sm md:tracking-[0.25em]"
              >
                <span className="relative z-10">{t("hero.cta.begin")}</span>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              </Link>
              <Link
                href="/roadmap"
                className="group relative overflow-hidden rounded-none border border-white/20 bg-white/[0.06] px-6 py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-white/[0.12] md:px-10 md:py-5 md:text-sm md:tracking-[0.25em]"
              >
                <span className="relative z-10">{t("hero.cta.ahead")}</span>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              </Link>
            </div>

            {/* Brotherhood signal — wire to a real Supabase count when ready */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 1 }}
              className="mt-6 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60 md:mt-10 md:text-xs"
            >
              <span className="text-[#e8c896]">
                {newMembersThisWeek === 1
                  ? t("hero.brotherhoodCountSingular", { count: 1 })
                  : t("hero.brotherhoodCountPlural", {
                      count: newMembersThisWeek,
                    })}
              </span>{" "}
              {t("hero.brotherhoodSuffix")}
            </motion.p>
          </div>
        </div>
      </section>

      {/* BREATHING MODULE — 60-second first commitment */}
      <section
        ref={breathSectionRef}
        className="relative z-20 px-6 py-10 md:py-24"
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60 md:mb-6 md:text-xs">
            {t("breath.label")}
          </p>
          <p
            className={`${serif.className} mb-6 text-2xl italic text-white md:mb-12 md:text-4xl`}
          >
            {t("breath.title")}
          </p>

          {/* Unified <BreathCircle /> — same component used on the
              dashboard meditation banner and /meditation. progressFraction
              drives the gold arc that fills over 60 seconds as
              breathSecondsElapsed counts up. */}
          <BreathCircle
            phase={breathPhase}
            size="lg"
            progressFraction={breathSecondsElapsed / 60}
          />

          {/* Completion message uses a moss-tinted color (#7d8c7d, lighter
              moss for legibility on dark) instead of the brand gold —
              signals exhale, not announcement. Two-color discipline:
              gold for prompts-in-motion, moss for done/calm states. */}
          <AnimatePresence>
            {breathSecondsElapsed >= 60 ? (
              <motion.p
                key="breath-complete"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className={`${serif.className} mt-6 max-w-md text-base italic leading-relaxed text-[#7d8c7d] md:mt-10 md:text-lg`}
              >
                {t("breath.complete")}
              </motion.p>
            ) : (
              <motion.p
                key="breath-prompt"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-6 max-w-md text-xs leading-relaxed text-white/65 md:mt-10 md:text-sm"
              >
                {t("breath.prompt")}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* THREE PILLARS — horizontal swipe on mobile, 3-col grid on desktop.
          The flex/grid switcheroo at md: keeps a single markup block.
          On mobile the next card peeks at the right edge (pr-8) so members
          immediately understand they can swipe — no arrows or dots needed,
          which fits Stone Harbor's quieter tone. */}
      <FloatingWarmPanel bg="bg-[#f3efe7]" grainId="grain-cards">
        <div className="hide-scrollbar flex gap-3 overflow-x-auto pr-8 snap-x snap-mandatory md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:pr-0">
          {[
            {
              number: "01",
              title: "Clarity",
              text: "Name what happened. Trust your perception again.",
            },
            {
              number: "02",
              title: "Calm",
              text: "Steady your nervous system. Reclaim your peace.",
            },
            {
              number: "03",
              title: "Strength",
              text: "Rebuild your identity, your boundaries, your forward motion.",
            },
          ].map((item, idx) => (
            <motion.div
              key={item.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: idx * 0.12 }}
              className="snap-start shrink-0 w-[85%] border-l border-stone-300 pl-5 md:w-auto md:shrink md:pl-8"
            >
              <p className="mb-3 text-sm font-semibold text-[#a9793d] md:mb-6">
                {item.number}
              </p>
              <h3
                className={`${serif.className} mb-3 text-3xl font-medium text-stone-900 md:mb-5 md:text-4xl`}
              >
                {item.title}
              </h3>
              <div className="mb-3 h-[2px] w-10 bg-[#a9793d] md:mb-5" />
              <p className="max-w-xs leading-relaxed text-stone-600">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </FloatingWarmPanel>

      {/* PULL QUOTE — the screenshot moment */}
      <section className="relative z-20 px-6 py-12 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
          className="mx-auto max-w-4xl text-center"
        >
          <p
            className={`${serif.className} text-2xl italic leading-tight text-white/95 md:text-6xl`}
          >
            &ldquo;You don&apos;t need to be fixed.
            <br />
            You need to be found.&rdquo;
          </p>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.4em] text-[#c4934e] md:mt-8 md:text-xs">
            — Stone Harbor
          </p>
        </motion.div>
      </section>

      {/* JOURNEY SELECTOR */}
      <FloatingWarmPanel bg="bg-[#efe8dc]" grainId="grain-journey">
        <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-12">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#a9793d] md:mb-5 md:text-sm">
              Your Recovery Journey
            </p>
            <h2
              className={`${serif.className} text-3xl font-medium leading-tight text-stone-900 md:text-7xl`}
            >
              Where are you right now?
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-stone-600 md:mt-6 md:text-lg">
              Choose the answer that feels closest. Stone Harbor will guide you
              toward the next grounded step.
            </p>
          </div>
          <div className="min-w-0 border border-stone-200 bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.12)] md:p-6">
            {/* Option buttons — horizontal swipe on mobile, vertical stack on desktop.
                Tap still selects; the swipe just makes the options take ~150px instead
                of ~250px of vertical space on phones. The description card below
                updates the same way it does today.

                min-w-0 on this flex container AND its parent grid item (the white
                card above) is critical: CSS Grid items default to min-width:auto
                which equals their content's intrinsic min-width. Without min-w-0,
                the shrink-0 flex children would grow the grid item past the
                viewport, stretching the whole grid column and clipping the left
                column's copy. */}
            <div
              ref={journeyCarouselRef}
              className="hide-scrollbar flex min-w-0 gap-3 overflow-x-auto pr-8 snap-x snap-mandatory md:grid md:gap-3 md:overflow-visible md:pr-0"
            >
              {Object.entries(journeyOptions).map(([key, option]) => {
                const active = selectedPath === key;
                return (
                  <button
                    key={key}
                    data-option={key}
                    onClick={() => setSelectedPath(key as JourneyKey)}
                    className={`snap-start shrink-0 w-[80%] border px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#586558] md:w-full md:shrink md:px-6 md:py-5 ${
                      active
                        ? "bg-[#f3efe7]"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                    style={
                      active
                        ? {
                            borderColor: option.accent,
                            boxShadow: `inset 0 0 0 1px ${option.accent}`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="text-sm font-bold uppercase tracking-[0.22em]"
                      style={{ color: option.accent }}
                    >
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPath}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35 }}
                className="mt-5 border border-stone-200 bg-[#f5f0e8] p-5 md:mt-8 md:p-8"
              >
                <p
                  className="mb-3 text-xs font-bold uppercase tracking-[0.3em]"
                  style={{ color: selectedJourney.accent }}
                >
                  {selectedJourney.identity}
                </p>
                <h3
                  className={`${serif.className} text-2xl font-medium text-stone-900 md:text-4xl`}
                >
                  {selectedJourney.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-stone-600 md:mt-4 md:text-base">
                  {selectedJourney.text}
                </p>
                <Link
                  href="/start-here"
                  className="mt-5 inline-flex rounded-none border border-[#f4d7a1]/50 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105 md:mt-7 md:px-8 md:py-4 md:text-sm"
                  style={{ backgroundColor: selectedJourney.accent }}
                >
                  {selectedJourney.action}
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </FloatingWarmPanel>

      {/* TRUST STRIP — clinical credibility + privacy */}
      <section className="relative z-20 px-6 py-12 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-5 text-center text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60 md:mb-8 md:text-xs">
            Built On Proven Practice
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.22em] text-white/75 md:gap-x-12 md:gap-y-6 md:text-sm md:tracking-[0.25em]">
            <span>Internal Family Systems</span>
            <span className="text-[#c4934e]">·</span>
            <span>Acceptance &amp; Commitment</span>
            <span className="text-[#c4934e]">·</span>
            <span>Somatic Practice</span>
            <span className="text-[#c4934e]">·</span>
            <span>Stoic Discipline</span>
          </div>
          <p className="mt-6 text-center text-[11px] leading-relaxed text-white/55 md:mt-10 md:text-xs">
            Your reflections, your journey, your data — yours alone. Encrypted.
            Never sold. Never shared.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-20 border-t border-white/10 bg-[#0A0A0B]/70 px-6 py-10 backdrop-blur md:py-16">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-4 md:gap-10">
          <div>
            <p className="text-xl font-semibold uppercase tracking-[0.28em] text-[#c4934e]">
              Stone Harbor
            </p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-[#c4934e]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-white/60">
              Begin
            </p>
            <ul className="space-y-2 text-sm text-white/80">
              <li>
                <Link href="/start-here" className="hover:text-[#c4934e]">
                  Start Here
                </Link>
              </li>
              <li>
                <Link href="/roadmap" className="hover:text-[#c4934e]">
                  Roadmap
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-[#c4934e]">
                  Join
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-white/60">
              Explore
            </p>
            <ul className="space-y-2 text-sm text-white/80">
              <li>
                <Link href="/resources" className="hover:text-[#c4934e]">
                  Resources
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-[#c4934e]">
                  About
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#c4934e]">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-white/60">
              If You Are In Crisis
            </p>
            <p className="text-sm leading-relaxed text-white/80">
              Call or text <span className="font-bold text-[#c4934e]">988</span>{" "}
              — the Suicide &amp; Crisis Lifeline. 24/7. Free. Confidential.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-white/10 pt-6 md:mt-16 md:pt-8">
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
            <p className={`${serif.className} text-base italic text-white/70 md:text-lg`}>
              The harbor is patient.
            </p>
            {/* Language picker — quiet placement in the footer, same
                pattern as the theme toggle. Switches between EN and
                ES; the URL updates accordingly. */}
            <LanguagePicker />
          </div>
        </div>
      </footer>
    </main>
  );
}

function FloatingWarmPanel({ children, bg, grainId }: PanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8 }}
      className="relative z-20 w-full py-0"
    >
      {/* Top edge bleed — softens the hard horizontal cut */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-16 bg-gradient-to-b from-black/30 to-transparent" />
      <div
        className={`relative w-full border-y border-white/30 px-5 py-8 shadow-[0_35px_120px_rgba(0,0,0,0.32)] md:px-20 md:py-16 ${bg}`}
      >
        {/* Paper grain on the cream — gives it soul, not slickness */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04] mix-blend-multiply"
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id={grainId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${grainId})`} />
        </svg>
        <div className="relative mx-auto max-w-7xl">{children}</div>
      </div>
      {/* Bottom edge bleed */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-16 bg-gradient-to-t from-black/30 to-transparent" />
    </motion.section>
  );
}
