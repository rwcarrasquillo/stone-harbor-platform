import { cookies } from "next/headers";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — next-intl request config.
 *
 * Server-side resolver that decides which messages file to load for
 * the current request. Three-step resolution (2026-05-31 update):
 *
 *   1. URL-driven (Phase 1 routes under /[locale]/...) — requestLocale
 *      reads the segment param and we honor it.
 *   2. Cookie-driven (Phase 2, authenticated member pages outside the
 *      [locale] segment — /dashboard, /journal, /messages, etc.) —
 *      read the NEXT_LOCALE cookie next-intl's middleware writes
 *      when the LanguagePicker switches.
 *   3. Default fallback (English).
 *
 * This lets the entire app honor the same locale regardless of
 * whether a particular page lives under the [locale] segment or not.
 * Moving every page into [locale] would have required updating every
 * internal link in the app; the cookie path was the smaller change.
 *
 * The dynamic import (`messages/${locale}.json`) is intentional: only
 * the language being served gets bundled with that response, so
 * Spanish messages aren't shipped to English visitors and vice versa.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  // Step 1 — URL-driven locale (Phase 1 segment routes)
  const requested = await requestLocale;
  if (hasLocale(routing.locales, requested)) {
    return {
      locale: requested,
      messages: (await import(`@/messages/${requested}.json`)).default,
    };
  }

  // Step 2 — cookie fallback for pages outside [locale]
  const store = await cookies();
  const cookieLocale = store.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, cookieLocale)
    ? cookieLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
