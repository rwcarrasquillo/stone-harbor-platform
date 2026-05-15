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

        <motion.div
          animate={{
            opacity: [0.18, 0.3, 0.18],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-white/5"
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

          <div className="hidden gap-12 text-sm font-bold uppercase tracking-[0.3em] text-white/90 md:flex">
            <a href="/join">Start</a>
            <a href="/roadmap">Roadmap</a>
            <a href="/resources">Resources</a>
            <a href="/about">About</a>
          </div>

          <a
            href="/join"
            className="group relative overflow-hidden rounded-full border border-white/30 bg-white/8 px-8 py-4 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-3xl transition duration-500 hover:scale-[1.05] hover:bg-white/14"
          >
            <span className="absolute inset-0 bg-gradient-to-br from-white/25 via-white/8 to-transparent opacity-80" />
            <span className="absolute left-3 top-2 h-6 w-24 rounded-full bg-white/25 blur-xl" />
            <span className="absolute bottom-1 right-4 h-8 w-20 rounded-full bg-white/10 blur-2xl" />
            <span className="relative z-10">Join</span>
          </a>
        </nav>

        {/* HERO CONTENT */}
        <motion.div
          initial={{ opacity: 0, y: 45 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.4 }}
          className="relative z-10 px-10 pt-20 md:px-28"
        >
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1 }}
            className="mb-5 text-sm font-semibold uppercase tracking-[0.45em] text-[#d8b07b] md:text-base"
          >
            Men&apos;s Mental Wellness
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1.3 }}
            className={`${serif.className} max-w-4xl text-7xl font-medium leading-[0.92] text-white md:text-[8.5rem]`}
          >
            The storm
            <br />
            changed you.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1.2 }}
            className="mt-10 max-w-xl text-xl leading-relaxed text-white/95 md:text-2xl"
          >
            Now rebuild what remains — with clarity, calm, strength, and
            purpose.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 1.1 }}
            className="mt-10 flex flex-col gap-5 sm:flex-row"
          >
            <a
              href="/join"
              className="group relative overflow-hidden rounded-full border border-white/35 bg-white/8 px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_12px_40px_rgba(0,0,0,0.2)] backdrop-blur-3xl transition duration-500 hover:scale-[1.06] hover:bg-white/14"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/28 via-white/8 to-transparent opacity-85" />
              <span className="absolute left-4 top-2 h-6 w-28 rounded-full bg-white/28 blur-xl" />
              <span className="absolute bottom-1 right-5 h-10 w-24 rounded-full bg-white/10 blur-2xl" />
              <span className="relative z-10">Start Recovery</span>
            </a>

            <a
              href="/roadmap"
              className="group relative overflow-hidden rounded-full border border-white/25 bg-white/6 px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_32px_rgba(0,0,0,0.16)] backdrop-blur-3xl transition duration-500 hover:scale-[1.05] hover:bg-white/12"
            >
              <span className="absolute inset-0 bg-gradient-to-br from-white/22 via-white/6 to-transparent opacity-80" />
              <span className="absolute left-4 top-2 h-6 w-24 rounded-full bg-white/22 blur-xl" />
              <span className="absolute bottom-1 right-4 h-8 w-20 rounded-full bg-white/8 blur-2xl" />
              <span className="relative z-10">View Roadmap</span>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* RECOVERY STRIP */}
      <section className="bg-[#f5f0e8] px-8 py-16 md:px-20">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-[0.25fr_1fr_1fr_1fr]">
          <div className="hidden items-center justify-center md:flex">
            <p className="rotate-[-90deg] whitespace-nowrap text-xs font-semibold uppercase tracking-[0.35em] text-stone-600">
              A Different Kind of Recovery
            </p>
          </div>

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
                  className={`rounded-2xl border px-6 py-5 text-left transition ${
                    selectedPath === key
                      ? "border-[#a9793d] bg-[#f3efe7] shadow-sm"
                      : "border-stone-200 bg-white/70 hover:border-[#a9793d]/60 hover:bg-white"
                  }`}
                >
                  <span className="text-sm font-bold uppercase tracking-[0.25em] text-[#a9793d]">
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
              className="mt-8 rounded-[1.5rem] bg-[#f5f0e8] p-8"
            >
              <h3
                className={`${serif.className} text-4xl font-medium text-stone-900`}
              >
                {
                  journeyOptions[selectedPath as keyof typeof journeyOptions]
                    .title
                }
              </h3>

              <p className="mt-4 leading-relaxed text-stone-600">
                {
                  journeyOptions[selectedPath as keyof typeof journeyOptions]
                    .text
                }
              </p>

              <a
                href="/join"
                className="mt-7 inline-flex rounded-full bg-[#a9793d] px-8 py-4 text-sm font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432]"
              >
                {
                  journeyOptions[selectedPath as keyof typeof journeyOptions]
                    .action
                }
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
              You are not broken. You are rebuilding.
            </h2>

            <p className="mt-4 max-w-3xl leading-relaxed text-stone-600">
              Stone Harbor is a private space for men healing from emotional
              abuse, divorce trauma, identity loss, and high-conflict
              relationships.
            </p>
          </div>

          <div className="flex flex-col items-start gap-5 md:items-center">
            <a
              href="/join"
              className="rounded-full bg-[#a9793d] px-12 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
            >
              Start Recovery
            </a>

            <a
              href="/resources"
              className="border-b border-[#a9793d] pb-1 text-sm font-semibold uppercase tracking-[0.25em] text-stone-600"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
