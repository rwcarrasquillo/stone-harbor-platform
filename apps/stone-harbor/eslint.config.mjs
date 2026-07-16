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
 * Hard-coded hex colors in Tailwind classes (SH-100 Wave 1)
 *
 * The harbor's palette lives in globals.css as --sh-* tokens. A class
 * like text-[#a9793d] pins one theme's value into markup, so it can't
 * follow data-theme and silently drifts from the token when the palette
 * moves. Use text-[var(--sh-accent-gold)] instead.
 *
 * Set to "warn", deliberately:
 *
 *   Wave 1 is palette-plumbing with no visible change. There is a real
 *   backlog of existing violations on surfaces Wave 1 doesn't touch
 *   (/journal/compose, /start-here, /settle-in, marketing). Erroring
 *   today would mean spraying eslint-disable-next-line across files this
 *   ship has no business editing, which buries the signal in noise and
 *   inflates the diff.
 *
 *   So: warn now, no disable comments. `pnpm lint` still exits clean,
 *   and the warning list IS the Wave 2 worklist. When Wave 2 burns it to
 *   zero, flip this to "error" and the door closes behind us.
 *
 * Two selectors because classNames appear both as plain string literals
 * and inside template literals (`${serif.className} text-[#a9793d]`).
 */
const HEX_IN_TAILWIND_CLASS =
  /(bg|text|border|from|to|via|ring|placeholder|caret|accent|decoration|divide|outline|shadow|fill|stroke)-\[#[0-9A-Fa-f]/;

const HEX_IN_TAILWIND_MESSAGE =
  "Hard-coded hex color in a Tailwind class. Use a token — e.g. text-[var(--sh-accent-gold)] — so it follows data-theme. If no token fits, add one to globals.css and Stone_Harbor_Design_System_v1.md §2 first.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${HEX_IN_TAILWIND_CLASS}]`,
          message: HEX_IN_TAILWIND_MESSAGE,
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${HEX_IN_TAILWIND_CLASS}]`,
          message: HEX_IN_TAILWIND_MESSAGE,
        },
      ],
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
