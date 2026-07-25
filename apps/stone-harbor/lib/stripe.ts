import Stripe from "stripe";

/**
 * Stone Harbor — Stripe server SDK singleton (SH-108, Lighthouse Keepers).
 *
 * Server-only. The secret key never reaches the browser; the browser
 * uses NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY via @stripe/stripe-js instead.
 *
 * LAZY on purpose (brief §8.6 / shipping prompt §2): the client is built
 * on first use, not at import. If it threw at module load, importing any
 * Keepers route would crash `next build` whenever STRIPE_SECRET_KEY is
 * absent — but §2 requires that a build with keepers_enabled = false and
 * no Stripe env vars still succeeds. Callers reach Stripe only after the
 * feature flag check, so the missing-key throw only fires when the
 * feature is actually exercised.
 *
 * apiVersion is PINNED — never "latest" — so a Stripe-side default bump
 * can't silently change the object shapes the webhook handler reads.
 */

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  _stripe = new Stripe(key, {
    // Must match the installed stripe-node (Stripe.LatestApiVersion ===
    // '2025-02-24.acacia'); bump both together when upgrading.
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}
