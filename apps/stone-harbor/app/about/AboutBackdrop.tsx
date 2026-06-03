"use client";

import { motion } from "framer-motion";

/**
 * Stone Harbor — /about atmospheric backdrop.
 *
 * Same layered visual as the home page so /about reads as a
 * continuation of the front door:
 *   1. Base dark layer (#0A0A0B)
 *   2. Slow-drifting forest hero (grayscale + low opacity)
 *   3. Black gradient scrim
 *   4. Dawn glow radial (warm gold focal point near the top)
 *   5. Topographic contour SVG pattern at very low opacity
 *
 * Used by both the published About page and the coming-soon
 * placeholder so the page never visually changes shape — only
 * the content inside it does.
 */

export function AboutBackdrop() {
  return (
    <>
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />
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
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-black/70 via-black/45 to-black/85" />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 22%, rgba(196,147,78,0.22) 0%, rgba(196,147,78,0.08) 35%, transparent 70%)",
        }}
      />
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="about-contour"
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
        <rect width="100%" height="100%" fill="url(#about-contour)" />
      </svg>
    </>
  );
}
