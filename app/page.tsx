"use client";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";

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

// Specific pain language — defeats the abstract-hero problem.
const stormMirrors = [
  "a divorce",
  "a betrayal",
  "burnout",
  "the loss of a parent",
  "waking up not recognizing yourself",
];

export default function Home() {
  const [selectedPath, setSelectedPath] = useState<JourneyKey>("clarity");
  const [memberName, setMemberName] = useState<string | null>(null);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");
  const [newMembersThisWeek, setNewMembersThisWeek] = useState<number>(0);

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

      {/* Vertical edge guides */}
      <div className="pointer-events-none fixed left-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none fixed right-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

      {/* HEADER */}
      <header className="fixed left-0 top-0 z-50 w-full border-b border-stone-300 bg-[#f3efe7] shadow-[0_18px_60px_rgba(0,0,0,0.15)]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex flex-col leading-none no-underline">
            <span className="text-xl font-semibold uppercase tracking-[0.28em] text-[#c4934e]">
              Stone Harbor
            </span>
            <span className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#c4934e]">
              Men&apos;s Mental Wellness
            </span>
          </Link>
          <div className="hidden gap-10 text-sm font-bold uppercase tracking-[0.22em] text-stone-700 md:flex">
            <Link href="/start-here" className="transition hover:text-[#c4934e]">
              Start
            </Link>
            <Link href="/roadmap" className="transition hover:text-[#c4934e]">
              Roadmap
            </Link>
            <Link href="/resources" className="transition hover:text-[#c4934e]">
              Resources
            </Link>
            <Link href="/about" className="transition hover:text-[#c4934e]">
              About
            </Link>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-3">
              {memberName ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558]"
                >
                  Logout
                </button>
              ) : (
                <Link
                  href="/login"
                  className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558]"
                >
                  Login
                </Link>
              )}
              <Link
                href={memberName ? "/dashboard" : "/register"}
                className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#586558]"
              >
                {memberName ? "Dashboard" : "Join"}
              </Link>
            </div>
            {memberName && (
              <p className="max-w-[220px] truncate text-right text-xs font-bold uppercase tracking-[0.18em] text-stone-600">
                {memberName}
              </p>
            )}
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative z-20 min-h-screen px-6 pb-20 pt-24">
        <div className="mx-auto flex min-h-[80vh] max-w-7xl items-start pt-24 md:pt-32">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 35 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className={`${serif.className} max-w-5xl text-7xl font-semibold leading-[0.9] text-white md:text-[8.5rem]`}
            >
              The storm
              <br />
              changed you.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              className="mt-10 max-w-xl text-xl leading-relaxed text-white md:text-2xl"
            >
              Now rebuild what remains — with clarity, calm, strength, and
              purpose.
            </motion.p>

            {/* Pain-mirror line — names the specific storm */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
              className={`${serif.className} mt-8 max-w-2xl text-lg italic leading-relaxed text-white/75 md:text-xl`}
            >
              Whether the storm was{" "}
              {stormMirrors.map((s, i) => (
                <span key={s}>
                  <span className="text-[#e8c896]">{s}</span>
                  {i < stormMirrors.length - 2
                    ? ", "
                    : i === stormMirrors.length - 2
                      ? ", or "
                      : ""}
                </span>
              ))}{" "}
              — you&apos;re in the right place.
            </motion.p>

            <div className="mt-12 flex flex-col gap-5 sm:flex-row">
              <Link
                href="/start-here"
                className="group relative overflow-hidden rounded-none border border-white/20 bg-white/[0.06] px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-white/[0.12]"
              >
                <span className="relative z-10">Begin Today</span>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              </Link>
              <Link
                href="/roadmap"
                className="group relative overflow-hidden rounded-none border border-white/20 bg-white/[0.06] px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-white/[0.12]"
              >
                <span className="relative z-10">See What&apos;s Ahead</span>
                <span className="absolute bottom-0 left-0 h-[2px] w-0 bg-[#c4934e] transition-all duration-500 group-hover:w-full" />
              </Link>
            </div>

            {/* Brotherhood signal — wire to a real Supabase count when ready */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 1 }}
              className="mt-10 text-xs font-semibold uppercase tracking-[0.3em] text-white/60"
            >
              <span className="text-[#e8c896]">
                {newMembersThisWeek === 1
                  ? "1 man"
                  : `${newMembersThisWeek} men`}
              </span>{" "}
              began recovery this week.
            </motion.p>
          </div>
        </div>
      </section>

      {/* BREATHING MODULE — 60-second first commitment */}
      <section className="relative z-20 px-6 py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.4em] text-white/60">
            Before You Scroll Further
          </p>
          <p
            className={`${serif.className} mb-12 text-3xl italic text-white md:text-4xl`}
          >
            Take sixty seconds.
          </p>
          <motion.div
            animate={{
              scale: breathPhase === "inhale" ? 1.4 : 1,
              opacity: breathPhase === "inhale" ? 0.95 : 0.6,
            }}
            transition={{ duration: 4, ease: "easeInOut" }}
            className="flex h-44 w-44 items-center justify-center rounded-full border border-[#c4934e]/40"
            style={{
              background:
                "radial-gradient(circle, rgba(196,147,78,0.22) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
            }}
          >
            <span
              className={`${serif.className} text-2xl italic text-white/90`}
            >
              {breathPhase === "inhale" ? "Inhale" : "Exhale"}
            </span>
          </motion.div>
          <p className="mt-10 max-w-md text-sm leading-relaxed text-white/65">
            One breath is enough to begin. The rest will follow.
          </p>
        </div>
      </section>

      {/* THREE PILLARS */}
      <FloatingWarmPanel bg="bg-[#f3efe7]" grainId="grain-cards">
        <div className="grid gap-8 md:grid-cols-3">
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
              className="border-l border-stone-300 pl-8"
            >
              <p className="mb-6 text-sm font-semibold text-[#a9793d]">
                {item.number}
              </p>
              <h3
                className={`${serif.className} mb-5 text-4xl font-medium text-stone-900`}
              >
                {item.title}
              </h3>
              <div className="mb-5 h-[2px] w-10 bg-[#a9793d]" />
              <p className="max-w-xs leading-relaxed text-stone-600">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </FloatingWarmPanel>

      {/* PULL QUOTE — the screenshot moment */}
      <section className="relative z-20 px-6 py-28">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
          className="mx-auto max-w-4xl text-center"
        >
          <p
            className={`${serif.className} text-4xl italic leading-tight text-white/95 md:text-6xl`}
          >
            &ldquo;You don&apos;t need to be fixed.
            <br />
            You need to be found.&rdquo;
          </p>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.4em] text-[#c4934e]">
            — Stone Harbor
          </p>
        </motion.div>
      </section>

      {/* JOURNEY SELECTOR */}
      <FloatingWarmPanel bg="bg-[#efe8dc]" grainId="grain-journey">
        <div className="grid gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.3em] text-[#a9793d]">
              Your Recovery Journey
            </p>
            <h2
              className={`${serif.className} text-5xl font-medium leading-tight text-stone-900 md:text-7xl`}
            >
              Where are you right now?
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600">
              Choose the answer that feels closest. Stone Harbor will guide you
              toward the next grounded step.
            </p>
          </div>
          <div className="border border-stone-200 bg-white p-6 shadow-[0_18px_60px_rgba(0,0,0,0.12)]">
            <div className="grid gap-3">
              {Object.entries(journeyOptions).map(([key, option]) => {
                const active = selectedPath === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedPath(key as JourneyKey)}
                    className={`border px-6 py-5 text-left transition focus:outline-none focus:ring-2 focus:ring-[#586558] ${
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
                className="mt-8 border border-stone-200 bg-[#f5f0e8] p-8"
              >
                <p
                  className="mb-3 text-xs font-bold uppercase tracking-[0.3em]"
                  style={{ color: selectedJourney.accent }}
                >
                  {selectedJourney.identity}
                </p>
                <h3
                  className={`${serif.className} text-4xl font-medium text-stone-900`}
                >
                  {selectedJourney.title}
                </h3>
                <p className="mt-4 leading-relaxed text-stone-600">
                  {selectedJourney.text}
                </p>
                <Link
                  href="/start-here"
                  className="mt-7 inline-flex rounded-none border border-[#f4d7a1]/50 px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105"
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
      <section className="relative z-20 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.4em] text-white/60">
            Built On Proven Practice
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm uppercase tracking-[0.25em] text-white/75">
            <span>Internal Family Systems</span>
            <span className="text-[#c4934e]">·</span>
            <span>Acceptance &amp; Commitment</span>
            <span className="text-[#c4934e]">·</span>
            <span>Somatic Practice</span>
            <span className="text-[#c4934e]">·</span>
            <span>Stoic Discipline</span>
          </div>
          <p className="mt-10 text-center text-xs leading-relaxed text-white/55">
            Your reflections, your journey, your data — yours alone. Encrypted.
            Never sold. Never shared.
          </p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-20 border-t border-white/10 bg-[#0A0A0B]/70 px-6 py-16 backdrop-blur">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-4">
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
        <div className="mx-auto mt-16 max-w-7xl border-t border-white/10 pt-8 text-center">
          <p className={`${serif.className} text-lg italic text-white/70`}>
            The harbor is patient.
          </p>
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
        className={`relative w-full border-y border-white/30 px-6 py-12 shadow-[0_35px_120px_rgba(0,0,0,0.32)] md:px-20 md:py-16 ${bg}`}
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
