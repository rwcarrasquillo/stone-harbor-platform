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
 * URL transform rules:
 *   /        ↔ /es
 *   /login   ↔ /es/login
 *   /es/foo  → /foo (when switching back to English)
 *
 * The default locale (English) follows localePrefix: "as-needed", so
 * its URLs are unprefixed. Spanish gets the /es/ prefix.
 */
export function LanguagePicker() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const t = useTranslations("common.language");
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;

    // Strip an existing locale prefix if present so we can rebuild
    // the URL cleanly. Pathname always starts with "/" so this is
    // safe to split.
    const segments = pathname.split("/").filter(Boolean);
    const first = segments[0];
    if (routing.locales.includes(first as (typeof routing.locales)[number])) {
      segments.shift();
    }

    const rest = segments.join("/");
    const target =
      next === routing.defaultLocale
        ? rest
          ? `/${rest}`
          : "/"
        : rest
          ? `/${next}/${rest}`
          : `/${next}`;

    startTransition(() => {
      router.replace(target);
    });
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
