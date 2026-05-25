import { defineRouting } from "next-intl/routing";

/**
 * Stone Harbor — i18n routing config.
 *
 * Two locales for now: English (the brand's first voice) and Spanish
 * (Phase 1 of the multilingual rollout). English is the default and
 * uses unprefixed URLs (/, /login). Spanish lives under /es/* so the
 * URL itself signals the locale and is shareable.
 *
 *   /              → English home
 *   /es            → Spanish home
 *   /login         → English login
 *   /es/login      → Spanish login
 *
 * localePrefix: "as-needed" achieves that — the default locale skips
 * the prefix, every other locale carries one. This is the same
 * pattern most international web apps use (Stripe, Linear, etc.).
 *
 * Adding a locale later (Portuguese, French) means appending its
 * code here and a parallel messages/<code>.json file. Nothing else
 * in the routing changes.
 */
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  // "always" — every locale carries its prefix in the URL, including
  // English at /en/*. We initially preferred "as-needed" (cleanest
  // user-facing URLs) but the host filesystem in this environment
  // doesn't permit deleting the legacy /app/page.tsx and
  // /app/login/page.tsx files. With "always", the static files are
  // overwritten as tiny redirect shims that point at /en/*, and the
  // [locale] segment becomes the single canonical surface for both
  // languages. This can be revisited to "as-needed" once the legacy
  // files are removed.
  localePrefix: "always",
});
