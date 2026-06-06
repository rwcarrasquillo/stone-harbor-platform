import { redirect } from "next/navigation";

/**
 * Stone Harbor — retired onboarding route (Option C).
 *
 * The 7-step onboarding wizard has been removed; /settle-in is now the
 * sole first-time member experience. This server-component shim catches
 * any lingering references — old bookmarks, in-app links, email links,
 * and the locale-prefixed /en/onboarding · /es/onboarding paths that
 * middleware folds down to /onboarding — and forwards them to /settle-in
 * in a single hop.
 */
export default function OnboardingPage() {
  redirect("/settle-in");
}
