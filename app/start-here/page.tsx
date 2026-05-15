"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const questions = [
  {
    question: "What feels most true right now?",
    subtitle:
      "Your first honest answer is often the doorway to your real starting point.",
    image: "/alpine-lake.png",
    imageLabel: "Alpine Lake",
    options: [
      { label: "I feel confused", path: "clarity", marker: "01" },
      { label: "I feel overwhelmed", path: "calm", marker: "02" },
      { label: "I feel angry", path: "strength", marker: "03" },
      { label: "I am ready to rebuild", path: "purpose", marker: "04" },
    ],
  },
  {
    question: "What do you need first?",
    subtitle:
      "Healing becomes stronger when you identify what your mind and body are truly asking for.",
    image: "/forest-staircase.png",
    imageLabel: "Forest Staircase",
    options: [
      { label: "Understanding what happened", path: "clarity", marker: "01" },
      { label: "Emotional steadiness", path: "calm", marker: "02" },
      { label: "Boundaries and discipline", path: "strength", marker: "03" },
      { label: "Direction and meaning", path: "purpose", marker: "04" },
    ],
  },
  {
    question: "What would help you most today?",
    subtitle: "Momentum begins when your next step feels aligned, not forced.",
    image: "/coastal-lighthouse.png",
    imageLabel: "Coastal Lighthouse",
    options: [
      { label: "A clear explanation", path: "clarity", marker: "01" },
      { label: "A grounding exercise", path: "calm", marker: "02" },
      { label: "A rebuilding plan", path: "strength", marker: "03" },
      { label: "A next-chapter roadmap", path: "purpose", marker: "04" },
    ],
  },
];

const results = {
  clarity: {
    title: "Your path begins with Clarity.",
    text: "You need understanding first — naming patterns, separating truth from distortion, and rebuilding trust in your own perception.",
    accent: "Understand. Name. See clearly.",
    image: "/alpine-lake.png",
    imageLabel: "Clarity",
  },
  calm: {
    title: "Your path begins with Calm.",
    text: "Your nervous system needs steadiness first — grounding, breathing, emotional regulation, and internal safety.",
    accent: "Breathe. Stabilize. Recenter.",
    image: "/alpine-lake.png",
    imageLabel: "Calm",
  },
  strength: {
    title: "Your path begins with Strength.",
    text: "You are ready to restore boundaries, confidence, discipline, and the structure that supports a stronger self.",
    accent: "Rebuild. Protect. Rise.",
    image: "/forest-staircase.png",
    imageLabel: "Strength",
  },
  purpose: {
    title: "Your path begins with Purpose.",
    text: "You are ready for direction, identity, and meaning — transforming pain into a new chapter.",
    accent: "Aim. Build. Become.",
    image: "/coastal-lighthouse.png",
    imageLabel: "Purpose",
  },
};

export default function StartHerePage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [step, setStep] = useState(0);

  const [scores, setScores] = useState<Record<string, number>>({
    clarity: 0,
    calm: 0,
    strength: 0,
    purpose: 0,
  });

  const isComplete = step >= questions.length;

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0.28;
    audio.loop = true;

    if (soundOn) {
      audio.pause();
      setSoundOn(false);
      return;
    }

    try {
      await audio.play();
      setSoundOn(true);
    } catch (error) {
      console.error("Audio playback failed:", error);
      setSoundOn(false);
    }
  }

  function choose(path: string) {
    setScores((prev) => ({
      ...prev,
      [path]: prev[path] + 1,
    }));

    setStep((prev) => prev + 1);
  }

  function resetAssessment() {
    setStep(0);
    setScores({
      clarity: 0,
      calm: 0,
      strength: 0,
      purpose: 0,
    });
  }

  const resultKey = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as
    | "clarity"
    | "calm"
    | "strength"
    | "purpose";

  const result = results[resultKey];

  const activeImage = isComplete ? result.image : questions[step].image;
  const activeLabel = isComplete
    ? result.imageLabel
    : questions[step].imageLabel;

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,123,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.7),transparent_30%)]" />

      <motion.div
        animate={{
          opacity: [0.2, 0.35, 0.2],
          scale: [1, 1.08, 1],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.45), transparent 25%)",
          filter: "blur(80px)",
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/"
            className="inline-block text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]"
          >
            ← Stone Harbor
          </a>

          <button
            onClick={toggleSound}
            className="group relative w-fit overflow-hidden rounded-full border border-stone-300 bg-white/70 px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-stone-700 shadow-sm backdrop-blur-xl transition hover:border-[#a9793d] hover:bg-white"
          >
            <span className="relative z-10">
              {soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
            </span>
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <AnimatePresence mode="wait">
            {!isComplete ? (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 35 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -25 }}
                transition={{ duration: 0.65 }}
                className="rounded-[3rem] border border-white/50 bg-white/70 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-14"
              >
                <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
                      Recovery Assessment
                    </p>

                    <p className="mt-2 text-sm uppercase tracking-[0.25em] text-stone-500">
                      Question {step + 1} of {questions.length}
                    </p>
                  </div>

                  <div className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-stone-200">
                    <motion.div
                      className="h-full rounded-full bg-[#a9793d]"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${((step + 1) / questions.length) * 100}%`,
                      }}
                      transition={{ duration: 0.6 }}
                    />
                  </div>
                </div>

                <h1
                  className={`${serif.className} max-w-5xl text-5xl font-medium leading-tight md:text-7xl`}
                >
                  {questions[step].question}
                </h1>

                <p className="mt-6 max-w-3xl text-lg leading-relaxed text-stone-600 md:text-xl">
                  {questions[step].subtitle}
                </p>

                <div className="mt-12 grid gap-4">
                  {questions[step].options.map((option, index) => (
                    <motion.button
                      key={option.label}
                      onClick={() => choose(option.path)}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      className="group flex items-center justify-between rounded-[2rem] border border-stone-200 bg-[#f8f4ed]/90 px-6 py-6 text-left transition duration-300 hover:-translate-y-1 hover:border-[#a9793d] hover:bg-white hover:shadow-xl"
                    >
                      <div className="flex items-center gap-5">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#a9793d]/40 bg-white/70 text-sm font-bold text-[#a9793d]">
                          {option.marker}
                        </span>

                        <span className="text-lg font-semibold md:text-xl">
                          {option.label}
                        </span>
                      </div>

                      <span className="text-2xl text-stone-400 transition group-hover:translate-x-2 group-hover:text-[#a9793d]">
                        →
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 35 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="rounded-[3rem] border border-white/50 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-14"
              >
                <p className="text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
                  Your Stone Harbor Path
                </p>

                <h1
                  className={`${serif.className} mt-6 max-w-5xl text-5xl font-medium leading-tight md:text-7xl`}
                >
                  {result.title}
                </h1>

                <p className="mt-8 text-xl font-semibold uppercase tracking-[0.25em] text-[#a9793d]">
                  {result.accent}
                </p>

                <p className="mt-8 max-w-3xl text-xl leading-relaxed text-stone-600">
                  {result.text}
                </p>

                <div className="mt-12 flex flex-col gap-5 sm:flex-row">
                  <a
                    href="/join"
                    className="rounded-full bg-[#a9793d] px-10 py-5 text-center text-sm font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
                  >
                    Continue Forward
                  </a>

                  <button
                    onClick={resetAssessment}
                    className="rounded-full border border-stone-400 px-10 py-5 text-sm font-bold uppercase tracking-[0.25em] text-stone-700 transition hover:bg-stone-100"
                  >
                    Retake Assessment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            key={activeImage}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="relative min-h-[460px] overflow-hidden rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.12)] lg:min-h-full"
          >
            <motion.div
              initial={{ scale: 1.08 }}
              animate={{
                scale: [1.08, 1.14, 1.08],
                x: [0, -10, 0],
                y: [0, -6, 0],
              }}
              transition={{
                duration: 22,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${activeImage})`,
              }}
            />

            <motion.div
              animate={{
                x: ["-10%", "10%", "-10%"],
                opacity: [0.14, 0.3, 0.14],
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
                x: ["-4%", "4%", "-4%"],
                opacity: [0.1, 0.22, 0.1],
              }}
              transition={{
                duration: 9,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-[42%]"
              style={{
                background:
                  "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.24) 45%, transparent 70%)",
                filter: "blur(18px)",
              }}
            />

            <motion.div
              animate={{
                opacity: [0.12, 0.22, 0.12],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 bg-white/5"
            />

            <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/10 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />

            <div className="absolute bottom-8 left-8 right-8 text-white">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-white/75">
                {activeLabel}
              </p>

              <h2 className={`${serif.className} text-4xl font-medium`}>
                Begin with one honest answer.
              </h2>
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
