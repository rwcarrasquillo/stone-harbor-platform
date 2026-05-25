import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — next-intl request config.
 *
 * Server-side resolver that decides which messages file to load for
 * the current request, based on the URL's locale segment. Falls back
 * to the default (English) if a route somehow arrives without a
 * resolved locale.
 *
 * The dynamic import (`messages/${locale}.json`) is intentional: only
 * the language being served gets bundled with that response, so
 * Spanish messages aren't shipped to English visitors and vice versa.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
