/**
 * Stone Harbor — Icon Set
 *
 * Design system:
 *   - 24×24 viewBox, line-only
 *   - 1.5px stroke (configurable via prop)
 *   - Round caps + joins (soft, contemplative)
 *   - currentColor stroke (icon adopts surrounding text color)
 *   - No fills except where structurally required
 *
 * Usage:
 *   import { Anchor, Compass, Flame, Mountain } from "@/components/icons";
 *   <Anchor size={20} className="text-[#a9793d]" />
 *   <Flame size={24} className="text-[#c4934e]" strokeWidth={1.75} />
 *
 * Color tokens that pair well:
 *   #c4934e  gold
 *   #a9793d  gold-deep
 *   #586558  moss
 *   stone-500 / stone-700 / white
 */

import React from "react";

export type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Svg({
  size = 20,
  className,
  strokeWidth = 1.5,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ──────────────────────────────────────────────
   BRAND & NAVIGATION
   ────────────────────────────────────────────── */

export function Anchor(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v14" />
      <path d="M8 11h8" />
      <path d="M5 14c0 4 3 7 7 7s7-3 7-7" />
    </Svg>
  );
}

export function Compass(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6l2.2 5.5L12 18l-2.2-6.5L12 6z" />
    </Svg>
  );
}

export function Lighthouse(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 21l1-10h4l1 10z" />
      <rect x="8" y="7" width="8" height="4" />
      <path d="M12 4v3" />
      <path d="M3 9l3 1" />
      <path d="M18 10l3-1" />
      <path d="M21 5l-2 1" />
      <path d="M5 6L3 5" />
    </Svg>
  );
}

export function Roadmap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 5h6c2 0 2 3 0 3H6c-2 0-2 3 0 3h12c2 0 2 3 0 3h-3c-2 0-2 3 0 3h6" />
      <circle cx="3" cy="5" r="1" fill="currentColor" />
      <circle cx="21" cy="17" r="1" fill="currentColor" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   PILLARS (Clarity · Calm · Strength)
   ────────────────────────────────────────────── */

export function Eye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  );
}

export function Wave(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0" />
      <path d="M3 13c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0" />
      <path d="M3 18c1.5-2 4.5-2 6 0s4.5 2 6 0 4.5-2 6 0" />
    </Svg>
  );
}

export function Mountain(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 20l6-11 4 6 4-9 4 14z" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   RITUAL & TIME OF DAY
   ────────────────────────────────────────────── */

export function Breath(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Svg>
  );
}

export function Sunrise(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 18h18" />
      <path d="M7 18a5 5 0 0110 0" />
      <path d="M12 3v3" />
      <path d="M5 9l1.5 1.5" />
      <path d="M19 9l-1.5 1.5" />
    </Svg>
  );
}

export function Moon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 4a8 8 0 100 16 6 6 0 010-16z" />
    </Svg>
  );
}

export function Flame(p: IconProps) {
  // streak icon — single elegant teardrop with a soft inner curl
  return (
    <Svg {...p}>
      <path d="M12 3c-3 5-3 9 0 18 3-9 3-13 0-18z" />
      <path d="M12 14c-1 2-1 3 0 5" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   PRIVACY & TRUST
   ────────────────────────────────────────────── */

export function Lock(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="10" rx="1" />
      <path d="M8 11V8a4 4 0 018 0v3" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </Svg>
  );
}

export function Shield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   COMMUNICATION
   ────────────────────────────────────────────── */

export function Message(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5h16v11h-9l-4 4v-4H4z" />
    </Svg>
  );
}

export function Speech(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5h16v9h-9l-4 4v-4H4z" />
      <circle cx="9" cy="10" r="0.8" fill="currentColor" />
      <circle cx="12" cy="10" r="0.8" fill="currentColor" />
      <circle cx="15" cy="10" r="0.8" fill="currentColor" />
    </Svg>
  );
}

export function Send(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M22 2L2 9l9 4z" />
      <path d="M22 2l-7 20-4-9" />
    </Svg>
  );
}

export function Bell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 17c0-7 1-9 6-9s6 2 6 9z" />
      <path d="M5 17h14" />
      <path d="M10 20a2 2 0 004 0" />
      <path d="M12 5V3" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   ACTIONS
   ────────────────────────────────────────────── */

export function Search(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5L20 20" />
    </Svg>
  );
}

export function Edit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16 4l4 4-11 11-5 1 1-5z" />
      <path d="M14 6l4 4" />
    </Svg>
  );
}

export function Plus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </Svg>
  );
}

export function Close(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}

export function Trash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 6h18" />
      <path d="M8 6V3h8v3" />
      <path d="M5 6l1 15h12l1-15" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

export function Logout(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 21H4V3h5" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H9" />
    </Svg>
  );
}

export function Settings(p: IconProps) {
  // minimal 8-spoke sun — elegant alternative to a mechanical gear
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2" />
      <path d="M12 17v2" />
      <path d="M5 12h2" />
      <path d="M17 12h2" />
      <path d="M7 7l1.5 1.5" />
      <path d="M15.5 15.5L17 17" />
      <path d="M17 7l-1.5 1.5" />
      <path d="M8.5 15.5L7 17" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   CHEVRONS
   ────────────────────────────────────────────── */

export function ChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function ChevronUp(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 15l6-6 6 6" />
    </Svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   AUDIO
   ────────────────────────────────────────────── */

export function SoundOn(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16 8c1.5 2 1.5 6 0 8" />
      <path d="M19 5c3 4 3 10 0 14" />
    </Svg>
  );
}

export function SoundOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16 9l5 6" />
      <path d="M21 9l-5 6" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   TIME
   ────────────────────────────────────────────── */

export function Calendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </Svg>
  );
}

export function Clock(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   MEMBER + CONTENT
   ────────────────────────────────────────────── */

export function User(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-5 4-7 8-7s8 2 8 7" />
    </Svg>
  );
}

export function Book(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4l8 2 8-2v16l-8 2-8-2z" />
      <path d="M12 6v16" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   ABOUT-ROW REPLACEMENTS (for the dashboard Anchor)
   ────────────────────────────────────────────── */

export function Pin(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21c-5-5-7-8-7-12a7 7 0 0114 0c0 4-2 7-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </Svg>
  );
}

export function Globe(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="9" ry="3.5" />
      <path d="M12 3c-3 3-3 15 0 18" />
      <path d="M12 3c3 3 3 15 0 18" />
    </Svg>
  );
}

export function Briefcase(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="12" />
      <path d="M9 8V5h6v3" />
      <path d="M3 13h18" />
    </Svg>
  );
}

export function Cap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 9l10-4 10 4-10 4z" />
      <path d="M6 11v5c0 1 3 3 6 3s6-2 6-3v-5" />
      <path d="M22 9v5" />
    </Svg>
  );
}

export function Link(p: IconProps) {
  // two linked rings — relationship
  return (
    <Svg {...p}>
      <circle cx="8.5" cy="12" r="4.5" />
      <circle cx="15.5" cy="12" r="4.5" />
    </Svg>
  );
}

export function Spark(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v5" />
      <path d="M12 16v5" />
      <path d="M3 12h5" />
      <path d="M16 12h5" />
      <path d="M5.5 5.5l3 3" />
      <path d="M15.5 15.5l3 3" />
      <path d="M18.5 5.5l-3 3" />
      <path d="M8.5 15.5l-3 3" />
    </Svg>
  );
}

/* ──────────────────────────────────────────────
   MOODS (journal page)
   ────────────────────────────────────────────── */

export function MoodGrounded(p: IconProps) {
  // pine tree
  return (
    <Svg {...p}>
      <path d="M5 13l7-9 7 9h-4l4 5H3l4-5z" />
      <path d="M12 18v3" />
    </Svg>
  );
}

export function MoodConfused(p: IconProps) {
  // question mark
  return (
    <Svg {...p}>
      <path d="M8 9a4 4 0 118 0c0 2-2 3-3 4l-1 1v1" />
      <circle cx="12" cy="18" r="0.8" fill="currentColor" />
    </Svg>
  );
}

export function MoodAngry(p: IconProps) {
  // lightning bolt
  return (
    <Svg {...p}>
      <path d="M13 3L6 13h5l-2 8 9-11h-5l2-7z" />
    </Svg>
  );
}

export function MoodSad(p: IconProps) {
  // raindrop
  return (
    <Svg {...p}>
      <path d="M12 3c-5 8-5 12 0 18 5-6 5-10 0-18z" />
    </Svg>
  );
}

export function MoodHopeful(p: IconProps) {
  // sunrise — re-export for mood naming
  return <Sunrise {...p} />;
}

export function MoodStrong(p: IconProps) {
  // mountain — re-export for mood naming
  return <Mountain {...p} />;
}
