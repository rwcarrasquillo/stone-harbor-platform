import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — legacy / redirect shim.
 *
 * The canonical home now lives at /app/[locale]/page.tsx and the
 * routing config (i18n/routing.ts) uses localePrefix: "always", so
 * every URL carries an /en/ or /es/ prefix. This file existed in the
 * codebase before the i18n rollout and the host filesystem in this
 * environment doesn't permit deleting it, so it's been emptied to a
 * one-line redirect that hands the visitor off to the default-locale
 * home. If the file ever gets deleted, nothing here changes.
 */
export default function RootRedirect() {
  redirect(`/${routing.defaultLocale}`);
}
