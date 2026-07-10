import { redirect } from "next/navigation";

/**
 * /[locale]/map/begin is retired — The Map moved to the Phase-2 root
 * path /map/begin. Middleware canonicalizes the locale-prefixed path;
 * this stub covers any deep link that reaches the old route first.
 */
export default function LocaleMapBeginRedirect() {
  redirect("/map/begin");
}
