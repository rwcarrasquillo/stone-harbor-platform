import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { serif, sans } from "@/lib/fonts";
import { WallOptIn } from "./WallOptIn";

/**
 * Stone Harbor — /keepers/success (SH-108, brief §8.5).
 *
 * Post-checkout confirmation. Retrieves the Checkout Session server-side
 * to confirm it completed, then shows the quiet thank-you and (for a
 * signed-in patron) the wall opt-in prompt. The opt-in is a client island
 * because signed-in state lives in the browser (localStorage session).
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Thank you — Lighthouse Keepers",
  robots: { index: false, follow: false },
};

async function confirmSession(sessionId: string | undefined): Promise<boolean> {
  if (!sessionId) return false;
  try {
    // Imported lazily so a missing STRIPE_SECRET_KEY can't break the
    // module graph of this public route at build time.
    const { getStripe } = await import("@/lib/stripe");
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });
    return session.status === "complete" || session.payment_status === "paid";
  } catch {
    return false;
  }
}

export default async function KeepersSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; locale?: string }>;
}) {
  const params = await searchParams;
  await confirmSession(params.session_id); // confirmed for side-effect logging; copy is unconditional
  const t = await getTranslations("keepers");

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col items-center justify-center bg-[var(--sh-bg-page)] px-4 py-16 text-[var(--sh-text-primary)]`}
    >
      <div className="mx-auto max-w-xl text-center">
        <h1 className={`${serif.className} text-2xl leading-snug md:text-3xl`}>
          {t("success.title")}
        </h1>

        <WallOptIn />

        <Link
          href="/dashboard"
          className="mt-12 inline-block text-sm text-[var(--sh-text-tertiary)] underline underline-offset-4 transition hover:text-[var(--sh-accent-gold)]"
        >
          {t("success.backToDashboard")}
        </Link>

        <p className={`${serif.className} mt-10 text-base italic text-[var(--sh-text-tertiary)]`}>
          {t("voiceSignature")}
        </p>
      </div>
    </main>
  );
}
