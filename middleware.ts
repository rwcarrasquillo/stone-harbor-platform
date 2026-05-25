import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Stone Harbor — locale middleware.
 *
 * NOTE: Next.js 16 deprecated the `middleware` file convention in
 * favor of `proxy`. The same logic is duplicated in `proxy.ts`. As
 * soon as the host filesystem allows it, delete `proxy.ts` and live
 * with the deprecation warning until you can also delete this file,
 * OR delete this file and keep `proxy.ts` (preferred). The current
 * environment only allows one of those files to be present at a
 * time; until the conflict is resolved, this file is the source of
 * truth and the dev server emits a non-blocking deprecation warning.
 *
 * Inspects each request and:
 *   • If the URL already carries a locale segment (`/es/...`), serves
 *     it as-is.
 *   • If the URL is unprefixed and matches an internationalized route,
 *     redirects to the default locale.
 *   • Sets a NEXT_LOCALE cookie so repeat visits respect the user's
 *     last viewed locale.
 *
 * The matcher restricts middleware to the routes that participate in
 * internationalization. Everything outside that set — /dashboard,
 * /journal, /api, static assets — is untouched.
 */
export default createMiddleware(routing);

export const config = {
  matcher: [
    "/",
    "/(en|es)/:path*",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/terms",
  ],
};
