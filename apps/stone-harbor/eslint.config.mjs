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

/* ---------------------------------------------------------------------
 * Raw auth checks outside the shared guard (SH-113)
 *
 * Every authenticated member surface must gate through
 * `requireActiveSession()` in lib/authGuards.ts. That helper runs three
 * checks in a deliberate order — signed in → not suspended → settled in
 * — and a page that calls `supabase.auth.getUser()` directly gets only
 * the first, silently skipping the suspension and settle-in gates.
 *
 * This is enforced by a rule rather than by convention because
 * convention already failed once. SH-110 found 13 member surfaces that
 * had drifted off the helper over several months, and nothing anywhere
 * flagged it: middleware.ts does locale canonicalization only and zero
 * auth work, so every gate in this app is client-side and per-page.
 * SH-112 and SH-114 closed the remaining gaps; this rule keeps them shut.
 *
 * The selectors match `<anything>.auth.getUser()` / `.getSession()`,
 * which covers the `supabase.auth.*` call shape wherever the client is
 * imported from.
 *
 * IMPORTANT — read before adding an allowlist entry: an exemption is not
 * "this file is noisy", it is "a gate here would be wrong". The existing
 * entries fall into five categories, each justified inline below. If a
 * new file doesn't fit one of them, it needs the helper, not an entry.
 */
const RAW_AUTH_CHECK_MESSAGE =
  "Raw Supabase auth check outside lib/authGuards.ts. Call requireActiveSession() instead — it also gates suspension and settle-in, which a bare getUser()/getSession() silently skips. If this surface genuinely must not gate (pre-auth flow, server route, redirect target of the guard itself, or a token read on an already-gated surface), add it to RAW_AUTH_ALLOWLIST in eslint.config.mjs with a reason.";

const RAW_AUTH_CHECK_SELECTORS = [
  {
    selector:
      "CallExpression[callee.object.property.name='auth'][callee.property.name='getUser']",
    message: RAW_AUTH_CHECK_MESSAGE,
  },
  {
    selector:
      "CallExpression[callee.object.property.name='auth'][callee.property.name='getSession']",
    message: RAW_AUTH_CHECK_MESSAGE,
  },
];

// Files where a raw auth check is the correct call. Every entry was
// audited against the call sites present when SH-113 shipped.
const RAW_AUTH_ALLOWLIST = [
  // (1) The helper itself — the one true implementation of the gate.
  "lib/authGuards.ts",

  // (2) Server-side. requireActiveSession() redirects by assigning
  // window.location, so it cannot run outside the browser. Route
  // handlers authenticate a bearer token instead of gating a rendered
  // surface.
  "lib/apiSupabase.ts",
  "lib/memberUsage.ts",
  "app/api/**",

  // (3) Pre-auth flows — there is no session to require yet, and
  // gating them would lock members out of the routes that create the
  // session in the first place.
  "app/auth/**",
  "app/login/**",
  "app/\\[locale\\]/login/**",
  "app/register/**",
  "app/forgot-password/**",
  "app/reset-password/**",

  // (4) Redirect TARGETS of the guard. requireActiveSession() sends
  // members to /settle-in and /suspended; calling it from those pages
  // would bounce them straight back into an infinite loop.
  "app/settle-in/page.tsx",
  "app/suspended/page.tsx",

  // (5) Public marketing + campaign surfaces. No member gate by design.
  // Escaped brackets: [locale] is a literal directory, not a character
  // class.
  "app/\\[locale\\]/**",
  "app/keepers/**",

  // (6) Token reads on surfaces that are ALREADY gated elsewhere. These
  // pull `session.access_token` to authorize a fetch — they are not
  // gates, and the helper has no token to hand back (it returns
  // {id, email}). /map in particular is gated once by MapChrome.tsx,
  // which every page under app/map/ renders.
  "app/map/**",
  "app/components/storyInvitationCard.tsx",
  "app/components/theMapTile.tsx",

  // (7) Runs above every gate — themeProvider must theme the login page
  // too, so it cannot depend on an active member session.
  "app/components/themeProvider.tsx",

  // (8) Child components of already-gated pages. They read identity to
  // scope a query or attribute an action, and neither redirects, so
  // neither is acting as a gate.
  "app/components/DailyQuoteCard.tsx",
  "app/components/flagButton.tsx",

  // (9) Founder-only tool. Gates on isFounderEmail(user.email) — a role
  // check the member helper doesn't model. Worth revisiting: it could
  // call requireActiveSession() first and then check the role, which
  // would also give it the suspension + settle-in gates it currently
  // lacks. Tracked as an SH-113 follow-up rather than folded in here.
  "app/founder/story-prompts/page.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "no-restricted-syntax": [
        "error",
        ...HEX_IN_TAILWIND_SELECTORS,
        ...RAW_AUTH_CHECK_SELECTORS,
      ],
    },
  },
  // SH-113 — raw-auth exemption. Drops ONLY the auth selectors; the hex
  // rule stays at "error" here. Must sit after the base block and before
  // BACKLOG_AT_WARN (see the ordering note on that block).
  {
    files: RAW_AUTH_ALLOWLIST,
    rules: {
      "no-restricted-syntax": ["error", ...HEX_IN_TAILWIND_SELECTORS],
    },
  },
  // Backlog exemption — hex selectors downgraded to "warn" (§5).
  //
  // ORDERING (SH-113): this block must stay LAST of the three that carry
  // hex selectors. Flat config replaces rule options rather than merging
  // them, so whichever block matches last decides the whole rule — both
  // its severity and its full selector list. Landing here after the
  // raw-auth exemption keeps these files at hex-"warn"; landing before it
  // would silently promote them back to "error" and reopen the backlog.
  //
  // These files carry no auth selectors, which is correct today: every
  // BACKLOG_AT_WARN entry that touches supabase.auth is also on
  // RAW_AUTH_ALLOWLIST (the pre-auth flows, /suspended, the [locale]
  // marketing surfaces). Note the coupling though — when a file's hex is
  // migrated and its entry leaves BACKLOG_AT_WARN, auth enforcement turns
  // ON for it. That direction is safe, but it is a real side effect.
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
      // SH-113 — was a bare "off". Because flat config replaces rule
      // options, "off" here would have switched off the raw-auth
      // selectors on these files too, not just the hex ones. Respelled
      // to keep the hex exemption while leaving the auth guard live.
      // Neither file calls supabase.auth today, so this adds no errors —
      // it just stops the exemption from widening beyond its intent.
      "no-restricted-syntax": ["error", ...RAW_AUTH_CHECK_SELECTORS],
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
