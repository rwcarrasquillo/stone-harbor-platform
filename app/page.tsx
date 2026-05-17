"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

type JourneyKey = "clarity" | "calm" | "strength";

type PanelProps = {
  children: React.ReactNode;
  bg: string;
};

const journeyOptions: Record<
  JourneyKey,
  {
    label: string;
    title: string;
    text: string;
    action: string;
  }
> = {
  clarity: {
    label: "I feel confused",
    title: "Start with clarity.",
    text: "You may still be questioning what happened. Begin by naming patterns, separating facts from emotional noise, and rebuilding trust in your own perception.",
    action: "Begin Clarity",
  },
  calm: {
    label: "I feel overwhelmed",
    title: "Start with calm.",
    text: "Your nervous system may be carrying prolonged stress. Begin with grounding, breath, rest, and emotional regulation.",
    action: "Find Calm",
  },
  strength: {
    label: "I am ready to rebuild",
    title: "Start with strength.",
    text: "You are ready to restore discipline, confidence, boundaries, and identity. The next step is rebuilding your life with structure.",
    action: "Build Strength",
  },
};

export default function Home() {
  const [selectedPath, setSelectedPath] = useState<JourneyKey>("clarity");
  const [memberName, setMemberName] = useState<string | null>(null);

  const selectedJourney = useMemo(
    () => journeyOptions[selectedPath],
    [selectedPath],
  );

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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-900`}
    >
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />

      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          x: ["0%", "-1.5%", "0%"],
          y: ["0%", "1.5%", "0%"],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="fixed inset-0 z-0 bg-cover bg-center opacity-45 grayscale"
        style={{ backgroundImage: "url('/forest-hero.png')" }}
      />

      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/65 via-black/35 to-black/80" />

      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.06]">
        <div className="h-full w-full bg-[linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] bg-[size:120px_120px]" />
      </div>

      <div className="pointer-events-none fixed left-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none fixed right-8 top-0 z-10 h-full w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

      <header className="fixed left-0 top-0 z-50 w-full border-b border-stone-300 bg-[#f3efe7] shadow-[0_18px_60px_rgba(0,0,0,0.15)]">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
          <a href="/" className="flex flex-col leading-none no-underline">
            <span className="text-xl font-semibold uppercase tracking-[0.45em] text-[#c4934e]">
              Stone Harbor
            </span>

            <span className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.42em] text-[#c4934e]">
              Men&apos;s Mental Wellness
            </span>
          </a>

          <div className="hidden gap-10 text-sm font-bold uppercase tracking-[0.28em] text-stone-700 md:flex">
            <a href="/start-here">Start</a>
            <a href="/roadmap">Roadmap</a>
            <a href="/resources">Resources</a>
            <a href="/about">About</a>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-3">
              {memberName ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black"
                >
                  Logout
                </button>
              ) : (
                <a
                  href="/login"
                  className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black"
                >
                  Login
                </a>
              )}

              <a
                href={memberName ? "/dashboard" : "/register"}
                className="rounded-none border border-[#c4934e] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#a9793d] transition hover:bg-[#c4934e] hover:text-black"
              >
                {memberName ? "Dashboard" : "Join"}
              </a>
            </div>

            {memberName && (
              <p className="max-w-[220px] truncate text-right text-xs font-bold uppercase tracking-[0.18em] text-stone-600">
                {memberName}
              </p>
            )}
          </div>
        </nav>
      </header>

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

            <p className="mt-10 max-w-xl text-xl leading-relaxed text-white md:text-2xl">
              Now rebuild what remains — with clarity, calm, strength, and
              purpose.
            </p>

            <div className="mt-10 flex flex-col gap-5 sm:flex-row">
              <a
                href="/start-here"
                className="rounded-none border border-white/20 bg-white/[0.06] px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-white/[0.12]"
              >
                Start Recovery
              </a>

              <a
                href="/roadmap"
                className="rounded-none border border-white/20 bg-white/[0.06] px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-white/[0.12]"
              >
                View Roadmap
              </a>
            </div>
          </div>
        </div>
      </section>

      <FloatingWarmPanel bg="bg-[#f3efe7]">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              number: "01",
              title: "Clarity",
              text: "Understand the patterns, name the storm, and end the confusion.",
            },
            {
              number: "02",
              title: "Calm",
              text: "Steady your nervous system and reclaim your peace from the inside out.",
            },
            {
              number: "03",
              title: "Strength",
              text: "Rebuild your identity, boundaries, and the confidence to move forward.",
            },
          ].map((item) => (
            <div key={item.number} className="border-l border-stone-300 pl-8">
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
            </div>
          ))}
        </div>
      </FloatingWarmPanel>

      <FloatingWarmPanel bg="bg-[#efe8dc]">
        <div className="grid gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.4em] text-[#a9793d]">
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
              {Object.entries(journeyOptions).map(([key, option]) => (
                <button
                  key={key}
                  onClick={() => setSelectedPath(key as JourneyKey)}
                  className={`border px-6 py-5 text-left transition ${
                    selectedPath === key
                      ? "border-[#a9793d] bg-[#f3efe7]"
                      : "border-stone-200 bg-white"
                  }`}
                >
                  <span className="text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPath}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="mt-8 border border-stone-200 bg-[#f5f0e8] p-8"
              >
                <h3
                  className={`${serif.className} text-4xl font-medium text-stone-900`}
                >
                  {selectedJourney.title}
                </h3>

                <p className="mt-4 leading-relaxed text-stone-600">
                  {selectedJourney.text}
                </p>

                <a
                  href="/start-here"
                  className="mt-7 inline-flex rounded-none border border-[#f4d7a1]/50 bg-[#a9793d] px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:scale-105 hover:bg-[#8d6432]"
                >
                  {selectedJourney.action}
                </a>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </FloatingWarmPanel>
    </main>
  );
}

function FloatingWarmPanel({ children, bg }: PanelProps) {
  return (
    <section className="relative z-20 w-full py-0">
      <div
        className={`w-full border-y border-white/30 px-6 py-12 shadow-[0_35px_120px_rgba(0,0,0,0.32)] md:px-20 md:py-16 ${bg}`}
      >
        <div className="mx-auto max-w-7xl">{children}</div>
      </div>
    </section>
  );
}
