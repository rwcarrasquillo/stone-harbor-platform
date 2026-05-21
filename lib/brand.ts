/**
 * Stone Harbor — Brand tokens.
 *
 * Single source of truth for the brand palette. Replaces the hex
 * literals scattered across 30+ files. Import the constants you need
 * and pass them to inline style props or use them as CSS variable
 * references.
 *
 * Two-color discipline:
 *   - GOLD / GOLD_DEEP — clarity, strength pillars; primary accent
 *   - MOSS              — calm pillar; supportive states
 *   - RED               — warnings, suspension, severe-violation
 *
 * Surface tokens:
 *   - CREAM             — base light background
 *   - CREAM_PANEL       — slightly darker cream for nested surfaces
 *   - DARK_BG           — dark backdrop (login, register, onboarding)
 *
 * NOTE: Tailwind classes that use these (bg-[#a9793d], text-[#586558])
 * remain in components. This file is for use in inline style props and
 * future utility helpers.
 */

export const BRAND = {
  GOLD: "#c4934e",
  GOLD_DEEP: "#a9793d",
  GOLD_LIGHT: "#d8b07b",
  MOSS: "#586558",
  RED: "#b14a3a",
  RED_DARK: "#8d2f21",
  CREAM: "#f3efe7",
  CREAM_PANEL: "#f8f4ed",
  CREAM_TINT: "#efe8dc",
  DARK_BG: "#0A0A0B",
} as const;

export type BrandColor = (typeof BRAND)[keyof typeof BRAND];
