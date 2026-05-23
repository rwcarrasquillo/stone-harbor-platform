"use client";

import { useTheme } from "@/app/components/themeProvider";
import { AmnioticBackdrop } from "@/app/components/amnioticBackdrop";

/**
 * Stone Harbor — PageAmbience.
 *
 * The unified atmospheric layer for every authenticated page. Lifts
 * the dashboard's signature backdrop into a reusable component so
 * the entire harbor breathes the same air: amniotic glow (Dusk only),
 * contour "ripples", paper grain, and the dawn glow in the upper
 * right.
 *
 * Layers, in document order (each `fixed inset-0 z-0` so they share
 * the viewport and sit behind the page's content section which is
 * lifted with `relative z-10`):
 *
 *   1. AmnioticBackdrop  — Dusk only. Warm drifting blobs of gold +
 *                          amber + moss + organic noise.
 *   2. Contour ripples   — Four soft sine-wave horizons tiled across
 *                          the page in brand gold. The "ripples" the
 *                          member sees moving through every screen.
 *   3. Paper grain       — feTurbulence at saturate=0, blended with
 *                          mix-blend-multiply for tactile depth.
 *   4. Dawn glow         — Soft radial gradient in the upper-right
 *                          corner. "Window of light."
 *
 * Pages that include <PageAmbience /> must wrap their content in a
 * `relative z-10` container so the content stacks above z-0 layers.
 * Pages must also set `relative overflow-hidden` on their <main>
 * element to anchor the fixed children correctly on iOS.
 *
 * Render in: /dashboard, /welcome, /journal, /messages,
 * /roadmap, /members-blog, /reflections (any authenticated screen).
 *
 * Skip in: /meditation and /vent (focused immersive experiences
 * where the global ambience would compete with the screen-specific
 * atmosphere). Public + auth routes don't render this either since
 * they already have RotatingNatureBackdrop or their own design.
 */
export function PageAmbience() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  return (
    <>
      {/* DUSK ONLY — amniotic backdrop. Sunlit mode renders without
          the atmospheric layer; the cream surface IS the atmosphere. */}
      {isDusk && <AmnioticBackdrop />}

      {/* AMBIENT — contour pattern; the "ripples" running across every
          page of the harbor */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.06]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="page-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 270 Q 80 240 160 270 T 320 270"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#page-contour)" />
      </svg>

      {/* AMBIENT — paper grain across the whole page */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <filter id="page-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#page-grain)" />
      </svg>

      {/* AMBIENT — dawn glow in upper right, the "window of light" */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 88% 8%, rgba(196,147,78,0.18) 0%, rgba(196,147,78,0.06) 40%, transparent 75%)",
        }}
      />
    </>
  );
}
