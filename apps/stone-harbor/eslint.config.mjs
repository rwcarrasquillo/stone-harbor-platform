import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Stone Harbor — ESLint config.
 *
 * Two of React 19's newer hooks rules trip the standard data-load-
 * on-mount pattern that Supabase JS clients use throughout this
 * codebase. We downgrade them from error to warn so they remain
 * visible in editor tooltips but don't block `next build`:
 *
 *   - react-hooks/set-state-in-effect
 *     Flags useEffect(() => { loadData(); }, []) which is the canonical
 *     pattern for loading async data on mount when the data is then
 *     stored in React state. Following the rule strictly would require
 *     extracting every load function into a custom hook + Suspense
 *     boundary — a multi-week refactor. Worth doing eventually; not now.
 *
 *   - react-hooks/immutability
 *     Flags window.location.href = "/login" as "modifying a value
 *     defined outside a component". The rule is intended for component
 *     state, not for browser globals used to force-reload after auth
 *     state changes. The intent of our code is correct.
 *
 * Other Next.js / TS rules stay at their defaults.
 *
 * ---------------------------------------------------------------------
 * Hard-coded hex colors in Tailwind classes (SH-100 Wave 1 → Wave 2)
 *
 * The harbor's palette lives in globals.css as --sh-* tokens. A class
 * like text-[#a9793d] pins one theme's value into markup, so it can't
 * follow data-theme and silently drifts from the token when the palette
 * moves. Use text-[var(--sh-accent-gold)] instead.
 *
 * Wave 1 shipped this at "warn": palette-plumbing with a real backlog of
 * existing violations on surfaces Wave 1 didn't touch. The warning list
 * WAS the Wave 2 worklist.
 *
 * Wave 2 burned the in-scope surfaces to zero (§1–§4): token swaps where
 * a token matched, file-ignores for the always-dark family (see below),
 * and per-line `eslint-disable-next-line -- bespoke …` grandfathers for
 * bespoke values with no token. So the base rule is now "error" and the
 * door has closed behind the member app — a new hex in a Tailwind class
 * fails the build.
 *
 * What stays at "warn" is the pre-auth / legal / marketing backlog that
 * Wave 2 had no business editing (auth flows, terms/privacy, the
 * localized marketing home + rhythm, the About surfaces). That list is
 * the worklist for a later wave; as each file is migrated its entry
 * leaves BACKLOG_AT_WARN below, and when the array empties the rule is
 * uniformly "error".
 *
 * Two selectors because classNames appear both as plain string literals
 * and inside template literals (`${serif.className} text-[#a9793d]`).
 */
const HEX_IN_TAILWIND_CLASS =
  /(bg|text|border|from|to|via|ring|placeholder|caret|accent|decoration|divide|outline|shadow|fill|stroke)-\[#[0-9A-Fa-f]/;

const HEX_IN_TAILWIND_MESSAGE =
  "Hard-coded hex color in a Tailwind class. Use a token — e.g. text-[var(--sh-accent-gold)] — so it follows data-theme. If no token fits, add one to globals.css and Stone_Harbor_Design_System_v1.md §2 first.";

// The rule's two selectors, shared so the base ("error") and the backlog
// exemption ("warn") stay in lockstep — flat-config replaces rule options
// rather than merging them, so both severities must carry the full spec.
const HEX_IN_TAILWIND_SELECTORS = [
  {
    selector: `JSXAttribute[name.name='className'] Literal[value=${HEX_IN_TAILWIND_CLASS}]`,
    message: HEX_IN_TAILWIND_MESSAGE,
  },
  {
    selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${HEX_IN_TAILWIND_CLASS}]`,
    message: HEX_IN_TAILWIND_MESSAGE,
  },
];

// Pre-auth / legal / marketing backlog held at "warn" (see the block
// comment above). Migrate a file, then delete its entry here; when this
// empties, drop this override and the rule is uniformly "error".
const BACKLOG_AT_WARN = [
  "app/register/**",
  "app/reset-password/**",
  "app/forgot-password/**",
  "app/auth/**",
  "app/suspended/**",
  "app/error.tsx",
  "app/not-found.tsx",
  "app/offline/**",
  "app/terms/**",
  "app/privacy/**",
  "app/about/**",
  // Escaped brackets: the [locale] segment is a literal directory, not a
  // glob character class.
  "app/\\[locale\\]/page.tsx",
  "app/\\[locale\\]/login/**",
  "app/\\[locale\\]/rhythm/**",
  "app/components/rhythmTile.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "no-restricted-syntax": ["error", ...HEX_IN_TAILWIND_SELECTORS],
    },
  },
  // Backlog exemption — same selectors, downgraded to "warn" (§5).
  {
    files: BACKLOG_AT_WARN,
    rules: {
      "no-restricted-syntax": ["warn", ...HEX_IN_TAILWIND_SELECTORS],
    },
  },
  // Always-dark surfaces are exempt from the hex-in-Tailwind rule (SH-100
  // Wave 2, §3). These render a fixed near-black canvas in BOTH themes by
  // design — the meditation experience and the amniotic backdrop it shares
  // with pageAmbience. A hard-coded dark hex is the correct call there, not
  // a theme-switching token, and future darks on these surfaces shouldn't
  // be nagged. Scoped tightly to the named family; single always-dark
  // elements inside otherwise-themed components are grandfathered per-line
  // with inline disables instead, so the rule stays live for the rest of
  // those files.
  {
    files: [
      "app/meditation/page.tsx",
      "app/components/amnioticBackdrop.tsx",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
