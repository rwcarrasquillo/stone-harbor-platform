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
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
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
