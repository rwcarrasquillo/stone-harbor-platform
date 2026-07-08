import { redirect } from "next/navigation";

/**
 * /[locale]/map/week/[n] is retired — the session runner moved to the
 * Phase-2 root path /map/week/[n]. The week number is preserved through
 * the redirect. Middleware canonicalizes the locale-prefixed path; this
 * stub covers deep links that reach the old route first.
 *
 * In Next.js 16 `params` is a Promise in server components.
 */
export default async function LocaleMapWeekRedirect({
  params,
}: {
  params: Promise<{ n: string; locale: string }>;
}) {
  const { n } = await params;
  redirect(`/map/week/${n}`);
}
