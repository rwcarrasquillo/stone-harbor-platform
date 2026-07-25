/**
 * POST /api/checkout/session — create a Stripe Checkout session for
 * Lighthouse Keepers patronage (SH-108, design brief §8.1).
 *
 * Two modes:
 *   - "subscription" → one of the three monthly tiers (tier_1/2/3),
 *     billed against a configured Stripe price.
 *   - "payment"      → a one-time custom-amount contribution
 *     (amountCents, min $1), billed via inline price_data.
 *
 * Anonymous checkout is allowed — a prospect can support the harbor
 * before they have (or without ever having) an account. When the caller
 * IS signed in (Authorization: Bearer …) we reuse their Stripe customer
 * if one exists and pre-fill their email.
 */

import { adminClient, anonClient, apiError, getBearerUser, requestOrigin } from "@/lib/apiSupabase";
import { getStripe } from "@/lib/stripe";
import { tierToPriceId, type KeepersTier } from "@/lib/stripeMapping";
import type Stripe from "stripe";

export const runtime = "nodejs";

type Body = {
  mode?: unknown;
  tier?: unknown;
  amountCents?: unknown;
  locale?: unknown;
};

const TIERS: ReadonlySet<string> = new Set(["tier_1", "tier_2", "tier_3"]);

export async function POST(req: Request) {
  // ---------- 1. Feature flag ----------
  const anon = anonClient();
  if (!anon) {
    return apiError(500, "server_misconfigured", "Checkout is temporarily unavailable.");
  }
  const { data: settings } = await anon
    .from("app_settings")
    .select("keepers_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!settings?.keepers_enabled) {
    return apiError(503, "service_unavailable");
  }

  // ---------- 2. Parse + validate ----------
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiError(400, "invalid_json", "Could not parse request body.");
  }

  const mode = body.mode === "subscription" || body.mode === "payment" ? body.mode : null;
  if (!mode) {
    return apiError(400, "invalid_mode", "mode must be 'subscription' or 'payment'.");
  }
  const locale = body.locale === "es" ? "es" : "en";

  let tier: KeepersTier | null = null;
  let amountCents = 0;
  if (mode === "subscription") {
    if (typeof body.tier !== "string" || !TIERS.has(body.tier)) {
      return apiError(400, "invalid_tier", "A valid tier is required for a subscription.");
    }
    tier = body.tier as KeepersTier;
  } else {
    amountCents =
      typeof body.amountCents === "number" && Number.isFinite(body.amountCents)
        ? Math.floor(body.amountCents)
        : 0;
    if (amountCents < 100) {
      return apiError(400, "invalid_amount", "A one-time contribution must be at least $1.");
    }
  }

  // ---------- 3. Optional signed-in caller ----------
  const user = await getBearerUser(req); // null when anonymous
  let existingCustomerId: string | null = null;
  if (user) {
    const admin = adminClient();
    if (admin) {
      const { data: profile } = await admin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();
      existingCustomerId = profile?.stripe_customer_id ?? null;
    }
  }

  // ---------- 4. Stripe Tax toggle (admin_settings, singleton id=1) ----------
  const { data: adminSettings } = await anon
    .from("admin_settings")
    .select("stripe_tax_enabled")
    .eq("id", 1)
    .maybeSingle();
  const taxEnabled = !!adminSettings?.stripe_tax_enabled;

  // ---------- 5. Build + create the Checkout session ----------
  const origin = requestOrigin(req);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    mode === "subscription"
      ? [{ price: tierToPriceId(tier as KeepersTier) ?? undefined, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: { name: "Stone Harbor patronage" },
            },
            quantity: 1,
          },
        ];

  if (mode === "subscription" && !lineItems[0].price) {
    // Tier requested but its Stripe price env var isn't set.
    return apiError(500, "server_misconfigured", "This tier is not available right now.");
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode,
    line_items: lineItems,
    success_url: `${origin}/keepers/success?session_id={CHECKOUT_SESSION_ID}&locale=${locale}`,
    cancel_url: `${origin}/keepers?checkout=canceled`,
    metadata: {
      tier: tier ?? "",
      user_id: user?.id ?? "",
      locale,
    },
  };

  // Reuse an existing customer when we have one; otherwise let Checkout
  // collect the email (and pre-fill it when the caller is signed in).
  if (existingCustomerId) {
    params.customer = existingCustomerId;
  } else if (user?.email) {
    params.customer_email = user.email;
  }

  if (taxEnabled) {
    params.automatic_tax = { enabled: true };
  }

  try {
    const session = await getStripe().checkout.sessions.create(params);
    return Response.json({ url: session.url });
  } catch (e) {
    console.error("/api/checkout/session create failed", e);
    return apiError(502, "stripe_error", "We couldn't start checkout. Please try again.");
  }
}
