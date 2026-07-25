/**
 * POST /api/billing/portal — open the Stripe Customer Portal so a patron
 * can self-serve tier changes, payment method updates, and cancellation
 * (SH-108, §8.3). Auth required.
 */

import { adminClient, apiError, getBearerUser, requestOrigin } from "@/lib/apiSupabase";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getBearerUser(req);
  if (!user) {
    return apiError(401, "unauthorized", "Please sign in to manage your patronage.");
  }

  const admin = adminClient();
  if (!admin) {
    return apiError(500, "server_misconfigured", "Billing is temporarily unavailable.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customer = profile?.stripe_customer_id;
  if (!customer) {
    return apiError(404, "no_customer", "No patronage is linked to this account yet.");
  }

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer,
      return_url: `${requestOrigin(req)}/keepers`,
    });
    return Response.json({ url: portal.url });
  } catch (e) {
    console.error("/api/billing/portal create failed", e);
    return apiError(502, "stripe_error", "We couldn't open the billing portal. Please try again.");
  }
}
