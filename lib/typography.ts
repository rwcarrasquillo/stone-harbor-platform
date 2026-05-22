/**
 * Stone Harbor — typography scale guidance.
 *
 * The product has accumulated 9 different Tailwind text sizes
 * (xs / sm / base / lg / xl / 2xl / 3xl / 4xl / 5xl / 6xl / 7xl).
 * That's too many. A tighter scale reads as confidence; a sprawling
 * scale reads as indecision.
 *
 * The canonical Stone Harbor type scale is SIX SIZES:
 *
 *   text-xs    (12px) — small UI labels, eyebrows, metadata
 *   text-sm    (14px) — body secondary, footnotes, dense lists
 *   text-base  (16px) — body default
 *   text-2xl   (24px) — card subheaders, section labels
 *   text-4xl   (36px) — section headings, modal titles
 *   text-7xl   (72px) — hero displays only
 *
 * Use the responsive prefixes (md:, lg:) to step between sizes per
 * breakpoint:
 *
 *   text-base md:text-2xl  — comfortable on phones, prominent on
 *                            desktop
 *   text-2xl md:text-7xl   — modest mobile heading, hero on desktop
 *
 * Banned sizes (snap to the nearest canonical when refactoring):
 *
 *   text-lg  (18px) → use text-base or text-2xl depending on weight
 *   text-xl  (20px) → use text-2xl
 *   text-3xl (30px) → use text-2xl or text-4xl
 *   text-5xl (48px) → use text-4xl
 *   text-6xl (60px) → use text-4xl or text-7xl
 *
 * Why six sizes:
 *   Van Schneider's discipline. Type hierarchy that's clear at every
 *   level. A reader's eye should always know what is more important
 *   than what — and that's only possible if the gaps between sizes
 *   are large enough to read.
 *
 * Existing code:
 *   ~140 occurrences of the banned sizes exist across the codebase
 *   today. They are not breaking the product, but they are diluting
 *   the brand's typographic intention. Refactor opportunistically:
 *   when you touch a file, snap any banned sizes you encounter. Do
 *   not do a mass find-and-replace — context matters.
 */

/**
 * The canonical scale. Importing from here in a component file is
 * not required (and not idiomatic — Tailwind uses utility classes
 * directly), but a developer who wants to reference the scale
 * programmatically can do so via this object.
 */
export const TYPE_SCALE = {
  xs: "text-xs", // 12px
  sm: "text-sm", // 14px
  base: "text-base", // 16px
  card: "text-2xl", // 24px
  section: "text-4xl", // 36px
  hero: "text-7xl", // 72px
} as const;
