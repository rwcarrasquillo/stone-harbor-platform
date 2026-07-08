import { redirect } from "next/navigation";

/**
 * /[locale]/map/operating-manual is retired — the reader moved to the
 * Phase-2 root path /map/operating-manual. Middleware canonicalizes the
 * locale-prefixed path; this stub covers deep links that reach the old
 * route first.
 */
export default function LocaleMapOperatingManualRedirect() {
  redirect("/map/operating-manual");
}
