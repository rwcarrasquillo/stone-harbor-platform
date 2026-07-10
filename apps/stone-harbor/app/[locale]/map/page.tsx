import { redirect } from "next/navigation";

/**
 * /[locale]/map is retired. The Map now lives at the Phase-2 root path
 * /map (no locale segment; locale resolves from the NEXT_LOCALE
 * cookie), matching /journal, /vent, /profile, etc. Middleware strips
 * the /(en|es) prefix for the "map" Phase-2 page, so this stub is
 * belt-and-suspenders for any deep link that reaches the old route
 * before middleware. Hash fragments re-apply client-side after the
 * redirect.
 */
export default function LocaleMapRedirect() {
  redirect("/map");
}
