"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function Home() {
  const [selectedPath, setSelectedPath] = useState("clarity");

  const journeyOptions = {
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

  const selectedJourney =
    journeyOptions[selectedPath as keyof typeof journeyOptions];

  return (
    <main
      className={`${sans.className} min-h-screen bg-[#f3efe7] text-stone-900`}
    >
      {/* HERO */}
      <section className="relative min-h-[760px] overflow-hidden">
        <motion.div
          initial={{ scale: 1.08 }}
          animate={{
            scale: [1.08, 1.14, 1.08],
            x: [0, -12, 0],
            y: [0, -8, 0],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/forest-hero.png')" }}
        />

        <motion.div
          animate={{
            x: ["-10%", "10%", "-10%"],
            opacity: [0.18, 0.32, 0.18],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 45%, rgba(255,255,255,0.28), transparent 35%), radial-gradient(circle at 65% 55%, rgba(255,255,255,0.18), transparent 30%)",
            filter: "blur(34px)",
          }}
        />

        <motion.div
          animate={{
            x: ["-3%", "3%", "-3%"],
            opacity: [0.12, 0.24, 0.12],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-[38%]"
          style={{
            background:
              "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.22) 45%, transparent 70%)",
            filter: "blur(18px)",
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/18 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/15" />

        {/* NAV */}
        <nav className="relative z-20 flex items-center justify-between px-10 py-8 md:px-16">
          <a
            href="/"
            className="text-2xl font-semibold uppercase tracking-[0.35em] text-white md:text-3xl"
          >
            Stone Harbor
          </a>

          <div className="hidden gap-10 text-sm font-bold uppercase tracking-[0.3em] text-white/90 md:flex">
            <a href="/start-here">Start</a>
            <a href="/roadmap">Roadmap</a>
            <a href="/resources">Resources</a>
            <a href="/about">About</a>
            <a href="/login">Login</a>
          </div>

          <div className="flex gap-4">
            <a
              href="/login"
              className="group relative hidden overflow-hidden rounded-full border border-white/35 bg-white/18 px-7 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_30px_rgba(0,0,0,0.28)] backdrop-blur-3xl transition duration-500 hover:scale-105 hover:bg-white/26 md:inline-flex"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/35 via-white/12 to-transparent opacity-85" />
              <span className="absolute left-3 top-2 h-6 w-20 rounded-full bg-white/25 blur-xl" />
              <span className="relative z-10">Member Login</span>
            </a>

            <a
              href="/join"
              className="group relative overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#c4934e]/28 px-8 py-4 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.3)] backdrop-blur-3xl transition duration-500 hover:scale-105 hover:bg-[#c4934e]/38"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/40 via-white/12 to-transparent opacity-85" />
              <span className="absolute left-4 top-2 h-6 w-24 rounded-full bg-white/20 blur-xl" />
              <span className="relative z-10">Join</span>
            </a>
          </div>
        </nav>

        {/* HERO CONTENT */}
        <motion.div
          initial={{ opacity: 0, y: 45 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4 }}
          className="relative z-10 px-10 pt-20 md:px-28"
        >
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.45em] text-[#d8b07b] md:text-base">
            Men&apos;s Mental Wellness
          </p>

          <h1
            className={`${serif.className} max-w-4xl text-7xl font-medium leading-[0.92] text-white md:text-[8.5rem]`}
          >
            The storm
            <br />
            changed you.
          </h1>

          <p className="mt-10 max-w-xl text-xl leading-relaxed text-white/95 md:text-2xl">
            Now rebuild what remains — with clarity, calm, strength, and
            purpose.
          </p>

          <div className="mt-10 flex flex-col gap-5 sm:flex-row">
            <a
              href="/start-here"
              className="group relative overflow-hidden rounded-full border border-white/40 bg-white/18 px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_35px_rgba(0,0,0,0.25)] backdrop-blur-3xl transition duration-500 hover:scale-105 hover:bg-white/26"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/35 via-white/10 to-transparent opacity-85" />
              <span className="relative z-10">Start Recovery</span>
            </a>

            <a
              href="/roadmap"
              className="group relative overflow-hidden rounded-full border border-white/30 bg-white/12 px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-3xl transition duration-500 hover:scale-105 hover:bg-white/20"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/28 via-white/8 to-transparent opacity-80" />
              <span className="relative z-10">View Roadmap</span>
            </a>
          </div>
        </motion.div>
      </section>

      {/* RECOVERY STRIP */}
      <section className="bg-[#f5f0e8] px-8 py-16 md:px-20">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3">
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
          ].map((item, index) => (
            <motion.div
              key={item.number}
              initial={{ opacity: 0, y: 45 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.8,
                delay: index * 0.15,
                ease: "easeOut",
              }}
              viewport={{ once: true, amount: 0.4 }}
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
      </section>

      {/* INTERACTIVE RECOVERY JOURNEY */}
      <section className="bg-[#efe8dc] px-8 py-20 md:px-20">
        <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-[0.9fr_1.1fr] md:items-center">
          <motion.div
            initial={{ opacity: 0, y: 45 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            viewport={{ once: true, amount: 0.3 }}
          >
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 45 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.15 }}
            viewport={{ once: true, amount: 0.3 }}
            className="rounded-[2rem] bg-white/80 p-6 shadow-sm backdrop-blur-xl"
          >
            <div className="grid gap-3">
              {Object.entries(journeyOptions).map(([key, option]) => (
                <button
                  key={key}
                  onClick={() => setSelectedPath(key)}
                  className={`group relative overflow-hidden rounded-2xl border px-6 py-5 text-left shadow-sm backdrop-blur-xl transition duration-300 hover:scale-[1.015] hover:shadow-md ${
                    selectedPath === key
                      ? "border-[#a9793d]/50 bg-[#f4d7a1]/35"
                      : "border-white/60 bg-white/45 hover:border-[#a9793d]/40 hover:bg-white/70"
                  }`}
                >
                  <span className="absolute inset-0 bg-gradient-to-br from-white/45 via-white/10 to-transparent opacity-70" />
                  <span className="relative z-10 text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            <motion.div
              key={selectedPath}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="mt-8 rounded-[1.5rem] border border-white/60 bg-white/45 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_35px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
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
                className="group relative mt-7 inline-flex overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#a9793d]/65 px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:scale-105 hover:bg-[#8d6432]/80"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
                <span className="relative z-10">{selectedJourney.action}</span>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* LOWER CTA */}
      <section className="bg-[#ebe4d8] px-8 py-14 md:px-20">
        <div className="mx-auto grid max-w-7xl items-center gap-10 md:grid-cols-[0.2fr_1.3fr_0.8fr]">
          <div className="flex justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#b48347] text-4xl text-[#a9793d]">
              ⚓
            </div>
          </div>

          <div>
            <h2
              className={`${serif.className} text-4xl font-medium text-stone-900 md:text-5xl`}
            >
              You are rebuilding.
            </h2>

            <p className="mt-4 max-w-3xl leading-relaxed text-stone-600">
              Stone Harbor is a private space for healing, recovery, identity
              rebuilding, and future connection.
            </p>
          </div>

          <div className="flex flex-col items-start gap-5 md:items-center">
            <a
              href="/join"
              className="group relative overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#a9793d]/65 px-12 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.2)] backdrop-blur-2xl transition duration-300 hover:scale-105 hover:bg-[#8d6432]/80"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
              <span className="relative z-10">Start Recovery</span>
            </a>

            <a
              href="/login"
              className="group relative overflow-hidden rounded-full border border-stone-300/70 bg-white/45 px-10 py-4 text-sm font-bold uppercase tracking-[0.25em] text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_25px_rgba(0,0,0,0.08)] backdrop-blur-2xl transition duration-300 hover:scale-105 hover:border-[#a9793d]/50 hover:bg-white/70"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/55 via-white/15 to-transparent opacity-80" />
              <span className="relative z-10">Member Login</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
