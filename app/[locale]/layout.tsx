import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — locale-aware nested layout.
 *
 * This layout wraps every page under app/[locale]/. It does NOT
 * render html/body — that stays in the root layout at app/layout.tsx
 * — only the React provider tree that the localized children need.
 *
 *   setRequestLocale(locale) — tells next-intl which messages bundle
 *   to serve for this server render, so server components further
 *   down the tree can call `getTranslations()` synchronously.
 *
 *   NextIntlClientProvider — exposes the same messages bundle to
 *   client components via `useTranslations()`.
 *
 * generateStaticParams pre-renders both locale variants at build
 * time so neither has a first-request cold path.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Defensive: if a request slips through with a locale that isn't in
  // our list (unlikely with the middleware in front, but cheap to
  // guard), fall through to a 404 rather than serving a broken page.
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  setRequestLocale(locale);

  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
