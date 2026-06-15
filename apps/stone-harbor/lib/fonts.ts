/**
 * Stone Harbor — Centralized font loaders.
 *
 * Every page imports `serif` and `sans` from here rather than calling
 * Source_Serif_4() / Inter_Tight() locally. Single source of weights
 * and subsets; consistent across the codebase.
 *
 * The CSS variables (--font-source-serif, --font-inter-tight) are
 * applied at the <html> level in app/layout.tsx so Tailwind utilities
 * like `font-serif` and `font-sans` pick them up via globals.css.
 *
 * ============================================================
 * Type decision provenance — 2026-06-15
 * ============================================================
 * Source Serif 4 + Inter Tight were chosen over the paid Klim stack
 * (Tiempos Headline + Söhne, ~$800-1,200) after a side-by-side lab
 * evaluation of 8 pairings on both Sunlit and Dusk themes.
 *
 * Reasoning summary (full record in stone-harbor-docs/
 * stone-harbor/Stone_Harbor_Design_System_v1.md):
 *
 *   1. Typography is table stakes for Stone Harbor, not the moat. The
 *      moat is voice, Eidos memory, and ship-discipline. Klim type
 *      buys ~15% more aesthetic refinement on a dimension that's
 *      not Stone Harbor's competitive edge.
 *   2. Source Serif 4 has an optical-sizing axis (8-60pt) so a single
 *      family handles both display and body sizes — something Klim
 *      requires two licensed families (Tiempos Headline + Tiempos
 *      Text) to achieve.
 *   3. Inter Tight is the same lineage as Inter (Stone Harbor's
 *      current sans) with tighter tracking. Vercel uses Inter
 *      internally; Linear uses Inter; the precedent is strong.
 *   4. The $800-1,200 saved goes to user research and custom
 *      illustration — both higher-leverage spends at pre-launch.
 *
 * If/when Stone Harbor reaches premium pricing or category-leader
 * positioning that justifies licensed type, revisit Klim:
 *   - Pairing B: Signifier + Söhne (carved-stone, name-of-product fit)
 *   - Pairing G: Martina Plantijn + National 2 (Plantin revival)
 *
 * Both held up well in the lab on Sunlit AND Dusk themes.
 * ============================================================
 */

import { Source_Serif_4, Inter_Tight } from "next/font/google";

export const serif = Source_Serif_4({
  subsets: ["latin"],
  // Stone Harbor uses three weights in member-facing copy:
  //   - 400 (body, paragraph text in story prompts)
  //   - 500 (medium — italic display headlines, PersonalizedGreeting)
  //   - 600 (semibold — section headings, occasional emphasis)
  // Source Serif 4 supports the full weight axis but keeping the
  // import set narrow trims the font payload.
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

export const sans = Inter_Tight({
  subsets: ["latin"],
  // Same three weights as the serif. 400 for body, 500 for medium
  // emphasis (sub-heads, button text), 600 for semibold (heavier UI
  // emphasis, brotherhood pairing card labels, etc.).
  weight: ["400", "500", "600"],
  variable: "--font-inter-tight",
  display: "swap",
});
