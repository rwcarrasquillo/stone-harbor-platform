/**
 * Stone Harbor — Stripe price-id ⇄ Keepers tier mapping (SH-108).
 *
 * The three monthly tiers map to three configured Stripe prices, set by
 * env var. The webhook handler maps an incoming subscription's price id
 * back to our internal tier slug; the checkout route maps the other way.
 */

export type KeepersTier = "tier_1" | "tier_2" | "tier_3";

/** Stripe price id → internal tier slug, or null if it's not a Keepers tier. */
export function priceIdToTier(priceId: string): KeepersTier | null {
  if (priceId === process.env.STRIPE_PRICE_KEEPERS_TIER_1) return "tier_1";
  if (priceId === process.env.STRIPE_PRICE_KEEPERS_TIER_2) return "tier_2";
  if (priceId === process.env.STRIPE_PRICE_KEEPERS_TIER_3) return "tier_3";
  return null;
}

/** Internal tier slug → configured Stripe price id, or null if unset. */
export function tierToPriceId(tier: KeepersTier): string | null {
  switch (tier) {
    case "tier_1":
      return process.env.STRIPE_PRICE_KEEPERS_TIER_1 ?? null;
    case "tier_2":
      return process.env.STRIPE_PRICE_KEEPERS_TIER_2 ?? null;
    case "tier_3":
      return process.env.STRIPE_PRICE_KEEPERS_TIER_3 ?? null;
    default:
      return null;
  }
}
