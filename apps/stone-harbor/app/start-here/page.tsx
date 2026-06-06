"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { serif, sans } from "@/lib/fonts";
/**
 * Image sets per question and result. The /nature/* paths are
 * sourced from Unsplash via scripts/fetch-unsplash-nature.mjs.
 * Legacy /*.png paths remain as fallbacks until the new images
 * land in public/nature/.
 */
const questions = [
  {
    question: "What feels most true right now?",
    subtitle:
      "Your first honest answer is often the doorway to your real starting point.",
    images: [
      "/nature/alpine-lake-trees-mountains.jpg",
      "/nature/sunrise-mountain-lake-icy-rocks.jpg",
      "/nature/lake-mountain-alps.jpg",
    ],
    imageLabel: "Still Waters",
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
    images: [
      "/nature/misty-forest-sunrise-soft-light.jpg",
      "/nature/misty-forest-dark-trees-fog.jpg",
      "/nature/misty-forest-warm-sunlight.jpg",
    ],
    imageLabel: "Forest Path",
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
    images: [
      "/nature/coastal-cliff-serene-sunset.jpg",
      "/nature/ocean-cliff-foggy-day.jpg",
      "/nature/coastal-portugal-beach-cliffs.jpg",
    ],
    imageLabel: "Distant Light",
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
    images: [
      "/nature/alpine-lake-trees-mountains.jpg",
      "/nature/sunrise-mountain-lake-icy-rocks.jpg",
      "/nature/lake-mountain-alps.jpg",
    ],
    imageLabel: "Clarity",
  },
  calm: {
    title: "Your path begins with Calm.",
    text: "Your nervous system needs steadiness first — grounding, breathing, emotional regulation, and internal safety.",
    accent: "Breathe. Stabilize. Recenter.",
    images: [
      "/nature/trees-lake-mountain-daytime.jpg",
      "/nature/alpine-lake-trees-mountains.jpg",
      "/nature/small-town-lake-mountains.jpg",
    ],
    imageLabel: "Calm",
  },
  strength: {
    title: "Your path begins with Strength.",
    text: "You are ready to restore boundaries, confidence, discipline, and the structure that supports a stronger self.",
    accent: "Rebuild. Protect. Rise.",
    images: [
      "/nature/misty-forest-dark-trees-fog.jpg",
      "/nature/misty-forest-warm-sunlight.jpg",
      "/nature/ocean-cliff-foggy-day.jpg",
    ],
    imageLabel: "Strength",
  },
  purpose: {
    title: "Your path begins with Purpose.",
    text: "You are ready for direction, identity, and meaning — transforming pain into a new chapter.",
    accent: "Aim. Build. Become.",
    images: [
      "/nature/coastal-cliff-serene-sunset.jpg",
      "/nature/ocean-cliff-santa-cruz.jpg",
      "/nature/coastal-portugal-beach-cliffs.jpg",
    ],
    imageLabel: "Purpose",
  },
};

/**
 * How long each image stays on screen before the next one fades in.
 * 12 seconds matches the meditative pacing of the box-breath cycle
 * on the home page — long enough that the rotation never feels like
 * a slideshow demanding attention, short enough to feel alive.
 */
const IMAGE_ROTATION_MS = 12000;

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

    audio.volume = 0.7;
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

  /**
   * Active image set for the current step (or result). Each step has 3
   * curated nature images that cross-fade in sequence. Resetting to
   * index 0 whenever the step or completion state changes ensures the
   * member always sees the "primary" image first when they arrive at
   * a new section.
   */
  const activeImages = isComplete
    ? result.images
    : questions[step].images;
  const activeLabel = isComplete
    ? result.imageLabel
    : questions[step].imageLabel;

  const [imageIndex, setImageIndex] = useState(0);
  const imageCount = activeImages.length;
  const activeImage = activeImages[imageIndex] ?? activeImages[0];

  // Reset to the first image on every step or completion transition.
  useEffect(() => {
    setImageIndex(0);
  }, [step, isComplete]);

  // Auto-rotate. Guarded so single-image sets don't tick uselessly.
  useEffect(() => {
    if (imageCount <= 1) return;
    const id = setInterval(() => {
      setImageIndex((i) => (i + 1) % imageCount);
    }, IMAGE_ROTATION_MS);
    return () => clearInterval(id);
  }, [imageCount, step, isComplete]);

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,176,123,0.18),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.7),transparent_30%)]" />

      <section className="relative z-10 mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-10">
        <Link
          href="/"
          className="mb-4 inline-block text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d] md:mb-8 md:text-sm md:tracking-[0.35em]"
        >
          ← Stone Harbor
        </Link>

        {/* Mobile order: image first (so it's visible above the fold), then card.
            Desktop (lg+) order: card on left, image on right. The lg:order-2
            on the image flips it to the right column at the lg breakpoint;
            the card stays at default order:0 which means it lands first. */}
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-8">
          {/* IMAGE PANEL — cross-fades through the current step's image set
              every 12s. Two motion.divs stack via AnimatePresence: the outer
              wrapper handles the opacity crossfade (1.4s), the inner div
              handles the continuous Ken Burns scale+pan loop. A drifting
              mist plume crosses the whole panel on a 60s loop, giving the
              "live nature" feel the user asked for without video weight. */}
          <div className="relative h-44 overflow-hidden rounded-[2rem] shadow-[0_20px_80px_rgba(0,0,0,0.12)] sm:h-56 lg:order-2 lg:h-auto lg:min-h-full lg:rounded-[3rem]">
            {/* Preload all images for the current step so cross-fades have no gap */}
            <div className="hidden">
              {activeImages.map((src) => (
                <img key={src} src={src} alt="" aria-hidden="true" />
              ))}
            </div>

            {/* Cross-fading image layer */}
            <AnimatePresence mode="popLayout">
              <motion.div
                key={activeImage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { duration: 1.4, ease: "easeInOut" } }}
                className="absolute inset-0"
              >
                {/* Continuous Ken Burns motion — independent of the fade */}
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
                  style={{ backgroundImage: `url(${activeImage})` }}
                />
              </motion.div>
            </AnimatePresence>

            {/* Drifting mist plume — slow horizontal traversal, fades in/out
                as it crosses. Creates ambient "living scene" feel across
                every image in the rotation. */}
            <motion.div
              animate={{
                x: ["-35%", "135%"],
                opacity: [0, 0.28, 0.28, 0],
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: "linear",
                times: [0, 0.2, 0.8, 1],
              }}
              className="pointer-events-none absolute inset-y-0 w-[60%]"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 35%, transparent 65%)",
                filter: "blur(30px)",
              }}
            />

            {/* Soft glow drift (slower, larger scale) — adds depth */}
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

            {/* Faster shimmer band along the bottom — water/wind impression */}
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

            {/* Color overlays — lightened so the photograph carries more
                vibrance. The bottom gradient stays at moderate opacity
                where the white overlay text sits; the left/right gradient
                is gentle so the image breathes on the right side. */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/22 via-black/5 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/5" />

            {/* Bottom-left label + caption (now uses the section label,
                so it stays consistent through the rotating images) */}
            <div className="absolute bottom-4 left-4 right-16 text-white lg:bottom-8 lg:left-8 lg:right-24">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.3em] text-white/75 lg:mb-3 lg:text-xs lg:tracking-[0.35em]">
                {activeLabel}
              </p>

              <h2
                className={`${serif.className} text-lg font-medium leading-tight md:text-2xl lg:text-4xl`}
              >
                Begin with one honest answer.
              </h2>
            </div>

            {/* Tiny rotation indicator — three dots showing which image
                of the set is currently visible. Subtle gold to stay on-brand. */}
            {imageCount > 1 && (
              <div className="absolute top-4 right-4 z-40 flex gap-1.5 lg:top-6 lg:right-6">
                {activeImages.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-1 rounded-full transition-all duration-700 ${
                      idx === imageIndex
                        ? "w-5 bg-[#c4934e]"
                        : "w-1 bg-white/40"
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
            )}

            <button
              onClick={toggleSound}
              className="absolute bottom-3 right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-2xl transition duration-300 hover:scale-110 hover:bg-white/25 lg:bottom-8 lg:right-8 lg:h-14 lg:w-14"
              aria-label={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
            >
              {soundOn ? (
                <Volume2 className="h-4 w-4 lg:h-6 lg:w-6" />
              ) : (
                <VolumeX className="h-4 w-4 lg:h-6 lg:w-6" />
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {!isComplete ? (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 35 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -25 }}
                transition={{ duration: 0.65 }}
                className="rounded-[2rem] border border-white/50 bg-white/70 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:rounded-[3rem] md:p-14"
              >
                <div className="mb-5 flex flex-col gap-3 md:mb-10 md:flex-row md:items-center md:justify-between md:gap-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d] md:text-sm md:tracking-[0.35em]">
                      Recovery Assessment
                    </p>

                    <p className="mt-1 text-xs uppercase tracking-[0.22em] text-stone-500 md:mt-2 md:text-sm md:tracking-[0.25em]">
                      Question {step + 1} of {questions.length}
                    </p>
                  </div>

                  <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-stone-200 md:h-3">
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
                  className={`${serif.className} max-w-5xl text-2xl font-medium leading-tight md:text-7xl`}
                >
                  {questions[step].question}
                </h1>

                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-stone-600 md:mt-6 md:text-xl">
                  {questions[step].subtitle}
                </p>

                <div className="mt-5 grid gap-2.5 md:mt-12 md:gap-4">
                  {questions[step].options.map((option, index) => (
                    <motion.button
                      key={option.label}
                      onClick={() => choose(option.path)}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      className="group flex items-center justify-between rounded-[1.25rem] border border-stone-200 bg-[#f8f4ed]/90 px-4 py-3.5 text-left transition duration-300 hover:-translate-y-1 hover:border-[#a9793d] hover:bg-white hover:shadow-xl md:rounded-[2rem] md:px-6 md:py-6"
                    >
                      <div className="flex items-center gap-3 md:gap-5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#a9793d]/40 bg-white/70 text-xs font-bold text-[#a9793d] md:h-11 md:w-11 md:text-sm">
                          {option.marker}
                        </span>

                        <span className="text-sm font-semibold md:text-xl">
                          {option.label}
                        </span>
                      </div>

                      <span className="text-xl text-stone-400 transition group-hover:translate-x-2 group-hover:text-[#a9793d] md:text-2xl">
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
                className="rounded-[2rem] border border-white/50 bg-white/75 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:rounded-[3rem] md:p-14"
              >
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d] md:text-sm md:tracking-[0.35em]">
                  Your Stone Harbor Path
                </p>

                <h1
                  className={`${serif.className} mt-3 max-w-5xl text-3xl font-medium leading-tight md:mt-6 md:text-7xl`}
                >
                  {result.title}
                </h1>

                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#a9793d] md:mt-8 md:text-xl md:tracking-[0.25em]">
                  {result.accent}
                </p>

                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-600 md:mt-8 md:text-xl">
                  {result.text}
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row md:mt-12 md:gap-5">
                  <Link
                    href="/register"
                    className="rounded-full bg-[#a9793d] px-6 py-3 text-center text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] md:px-10 md:py-5 md:text-sm md:tracking-[0.25em]"
                  >
                    Continue Forward
                  </Link>

                  <button
                    onClick={resetAssessment}
                    className="rounded-full border border-stone-400 px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-stone-700 transition hover:bg-stone-100 md:px-10 md:py-5 md:text-sm md:tracking-[0.25em]"
                  >
                    Retake Assessment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}
