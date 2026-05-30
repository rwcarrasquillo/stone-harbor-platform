"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — LanguagePicker.
 *
 * Quiet, two-option toggle (EN / ES) styled to match the theme
 * toggle's restraint — small, gold accent, never assertive. Lives
 * in the footer of public pages.
 *
 * Behavior:
 *   • Reads the current locale from next-intl.
 *   • On click, computes the equivalent URL in the target locale and
 *     navigates there with router.replace (so the language switch
 *     doesn't pile entries into the browser history).
 *   • Writes the NEXT_LOCALE cookie so the next bare visit (no URL
 *     prefix) lands on the user's last choice. next-intl's middleware
 *     does the cookie write itself once the navigation completes, so
 *     we don't have to handle it here.
 *
 * URL transform rules (routing.localePrefix === "always"):
 *   /en/foo  ↔ /es/foo
 *   /en      ↔ /es
 *
 * Both locales carry an explicit prefix because the routing config
 * uses localePrefix: "always". An earlier version of this file
 * stripped the English prefix to produce unprefixed URLs ("/foo"),
 * which 404'd against the [locale]-segmented routes once "always"
 * was adopted — bug surfaced 2026-05-31 on /es/map → English click.
 */
export function LanguagePicker() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const t = useTranslations("common.language");
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;

    // Write the NEXT_LOCALE cookie unconditionally so cookie-driven
    // pages (the Phase 2 authenticated routes outside /[locale]) pick
    // up the new locale on refresh. 1-year max-age matches the rest
    // of the harbor's "set it once and forget it" preferences.
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;

    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0];
    const hasLocalePrefix = routing.locales.includes(
      first as (typeof routing.locales)[number],
    );

    if (hasLocalePrefix) {
      // Phase 1 page (under /[locale]/*) — swap the prefix so the
      // URL itself signals the new locale. router.replace prevents
      // piling history entries on every toggle.
      segments.shift();
      const rest = segments.join("/");
      const target = rest ? `/${next}/${rest}` : `/${next}`;
      startTransition(() => {
        router.replace(target);
      });
    } else {
      // Phase 2 page (cookie-driven, e.g. /dashboard, /journal,
      // /messages, /members-blog, /resources, /roadmap, /welcome,
      // /meditation, /vent). The cookie was just written; refresh
      // re-fetches the page with next-intl's getRequestConfig
      // reading the new cookie value.
      startTransition(() => {
        router.refresh();
      });
    }
  }

  return (
    <div
      className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400"
      aria-label={t("label")}
    >
      <span className="opacity-70">{t("label")}:</span>
      <div className="inline-flex items-center gap-1">
        {routing.locales.map((code, idx) => (
          <span key={code} className="contents">
            <button
              type="button"
              onClick={() => switchTo(code)}
              aria-pressed={code === locale}
              disabled={isPending}
              className={`transition ${
                code === locale
                  ? "text-[#c4934e]"
                  : "text-stone-400 hover:text-[#c4934e]"
              }`}
            >
              {t(code as "en" | "es")}
            </button>
            {idx < routing.locales.length - 1 && (
              <span aria-hidden="true" className="text-stone-600">
                /
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
