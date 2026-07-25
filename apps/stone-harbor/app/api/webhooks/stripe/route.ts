/**
 * POST /api/webhooks/stripe — Stripe webhook receiver (SH-108, §8.2).
 *
 * Flow:
 *   1. Read the RAW body (signature verification needs the exact bytes).
 *   2. Verify the `stripe-signature` header against STRIPE_WEBHOOK_SECRET.
 *      Bad signature → 400, zero side effects.
 *   3. Idempotency: claim the event in `webhook_events` (insert,
 *      ignore-duplicates). If the row already existed, Stripe is
 *      re-delivering an event we already handled → 200, no work.
 *   4. Route by event.type, update `profiles` + append a `patron_events`
 *      audit row, and (on the first successful subscription/one-time
 *      confirmation) send the thank-you email.
 *   5. Record a handler_result summary on the webhook_events row.
 *
 * On any handler exception we return 500 so Stripe retries; the
 * idempotency ledger guarantees a retry can't double-process.
 */

import { adminClient } from "@/lib/apiSupabase";
import { getStripe } from "@/lib/stripe";
import { priceIdToTier } from "@/lib/stripeMapping";
import { sendKeepersThankYou } from "@/lib/keepersEmail";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("/api/webhooks/stripe: STRIPE_WEBHOOK_SECRET not set");
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // 1. Raw body + signature header.
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  // 2. Verify. Any failure here is a 400 with no DB writes.
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return Response.json({ error: "bad_signature" }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) {
    // Can't record or process without the service role. 500 → Stripe retries.
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // 3. Idempotency claim. ignoreDuplicates → a re-delivered event returns
  //    an empty set, meaning we've already processed it.
  const { data: claimed, error: claimErr } = await admin
    .from("webhook_events")
    .upsert(
      { event_id: event.id, event_type: event.type },
      { onConflict: "event_id", ignoreDuplicates: true },
    )
    .select("event_id");

  if (claimErr) {
    console.error("/api/webhooks/stripe: idempotency claim failed", claimErr);
    return Response.json({ error: "ledger_error" }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    // Already processed — acknowledge and stop.
    return Response.json({ received: true, duplicate: true }, { status: 200 });
  }

  // 4. Handle.
  try {
    const result = await handleEvent(admin, event);
    await admin
      .from("webhook_events")
      .update({ handler_result: result })
      .eq("event_id", event.id);
    return Response.json({ received: true }, { status: 200 });
  } catch (e) {
    console.error(`/api/webhooks/stripe: handler failed for ${event.type}`, e);
    // Leave the webhook_events row in place; the UNIQUE guards on
    // patron_events keep a Stripe retry from duplicating audit rows.
    return Response.json({ error: "handler_error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------

type HandlerResult = { ok: boolean; action: string };

async function handleEvent(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(admin, event);
    case "invoice.paid":
      return handleInvoicePaid(admin, event);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(admin, event);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(admin, event);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(admin, event);
    default:
      // Acknowledge unhandled types without side effects.
      return { ok: true, action: `ignored:${event.type}` };
  }
}

/** Subscription current_period_end (unix seconds) → ISO string, or null. */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const secs = sub.current_period_end;
  return typeof secs === "number" ? new Date(secs * 1000).toISOString() : null;
}

/** Resolve the Stone Harbor profile id for a customer, in priority order:
 *  metadata.user_id → existing stripe_customer_id link → email match.
 *  Returns null for a non-member patron (event stored with user_id null). */
async function resolveProfileId(
  admin: SupabaseClient,
  opts: { userIdMeta?: string | null; customerId?: string | null; email?: string | null },
): Promise<string | null> {
  if (opts.userIdMeta) return opts.userIdMeta;
  if (opts.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (opts.email) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("email", opts.email)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function insertPatronEvent(
  admin: SupabaseClient,
  row: {
    user_id: string | null;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    stripe_event_id: string;
    event_type: string;
    amount_cents: number | null;
    currency: string;
    tier: string | null;
    raw_payload: unknown;
  },
): Promise<void> {
  const { error } = await admin.from("patron_events").insert(row);
  // 23505 = unique_violation on stripe_event_id — a Stripe retry that
  // slipped past the ledger. Safe to ignore; the row already exists.
  if (error && error.code !== "23505") throw error;
}

function customerId(v: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

async function handleCheckoutCompleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const cust = customerId(session.customer);
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const userIdMeta = session.metadata?.user_id || null;

  const profileId = await resolveProfileId(admin, {
    userIdMeta,
    customerId: cust,
    email,
  });

  if (session.mode === "subscription") {
    const subId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;
    let tier: string | null = null;
    let periodEnd: string | null = null;
    if (subId) {
      const sub = await getStripe().subscriptions.retrieve(subId);
      const priceId = sub.items.data[0]?.price?.id ?? "";
      tier = priceId ? priceIdToTier(priceId) : null;
      periodEnd = periodEndIso(sub);
    }

    if (profileId) {
      await admin
        .from("profiles")
        .update({
          stripe_customer_id: cust,
          patron_status: "active",
          patron_tier: tier,
          patron_since: new Date().toISOString(),
          patron_current_period_end: periodEnd,
        })
        .eq("id", profileId);
    }

    await insertPatronEvent(admin, {
      user_id: profileId,
      stripe_customer_id: cust,
      stripe_subscription_id: subId,
      stripe_event_id: event.id,
      event_type: event.type,
      amount_cents: session.amount_total ?? null,
      currency: session.currency ?? "usd",
      tier,
      raw_payload: event as unknown,
    });

    await sendKeepersThankYou(admin, {
      profileId,
      email,
      mode: "subscription",
      tier,
      amountCents: session.amount_total ?? null,
      currency: session.currency ?? "usd",
      paymentRef: typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? subId ?? session.id),
    });

    return { ok: true, action: profileId ? "profile_updated_active" : "event_stored_unlinked" };
  }

  // One-time (mode === "payment"): audit + email only, no patron_status change.
  await insertPatronEvent(admin, {
    user_id: profileId,
    stripe_customer_id: cust,
    stripe_subscription_id: null,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    tier: null,
    raw_payload: event as unknown,
  });

  await sendKeepersThankYou(admin, {
    profileId,
    email,
    mode: "payment",
    tier: null,
    amountCents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    paymentRef: typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? session.id),
  });

  return { ok: true, action: "onetime_recorded" };
}

async function handleInvoicePaid(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const cust = customerId(invoice.customer);
  const line = invoice.lines?.data?.[0];
  const periodEnd = typeof line?.period?.end === "number"
    ? new Date(line.period.end * 1000).toISOString()
    : null;
  const subId = (invoice as unknown as { subscription?: string | { id: string } }).subscription;
  const subscriptionId = typeof subId === "string" ? subId : subId?.id ?? null;

  const profileId = await resolveProfileId(admin, { customerId: cust, email: invoice.customer_email });

  if (profileId && periodEnd) {
    await admin
      .from("profiles")
      .update({ patron_current_period_end: periodEnd, patron_status: "active" })
      .eq("id", profileId);
  }

  await insertPatronEvent(admin, {
    user_id: profileId,
    stripe_customer_id: cust,
    stripe_subscription_id: subscriptionId,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: invoice.amount_paid ?? null,
    currency: invoice.currency ?? "usd",
    tier: null,
    raw_payload: event as unknown,
  });

  return { ok: true, action: "renewal_recorded" };
}

async function handleInvoicePaymentFailed(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  const invoice = event.data.object as Stripe.Invoice;
  const cust = customerId(invoice.customer);
  const profileId = await resolveProfileId(admin, { customerId: cust, email: invoice.customer_email });

  if (profileId) {
    await admin.from("profiles").update({ patron_status: "past_due" }).eq("id", profileId);
  }

  await insertPatronEvent(admin, {
    user_id: profileId,
    stripe_customer_id: cust,
    stripe_subscription_id: null,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: invoice.amount_due ?? null,
    currency: invoice.currency ?? "usd",
    tier: null,
    raw_payload: event as unknown,
  });

  return { ok: true, action: "marked_past_due" };
}

async function handleSubscriptionUpdated(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  const sub = event.data.object as Stripe.Subscription;
  const cust = customerId(sub.customer);
  const priceId = sub.items.data[0]?.price?.id ?? "";
  const tier = priceId ? priceIdToTier(priceId) : null;
  const periodEnd = periodEndIso(sub);
  const profileId = await resolveProfileId(admin, { customerId: cust });

  if (profileId) {
    await admin
      .from("profiles")
      .update({ patron_tier: tier, patron_current_period_end: periodEnd })
      .eq("id", profileId);
  }

  await insertPatronEvent(admin, {
    user_id: profileId,
    stripe_customer_id: cust,
    stripe_subscription_id: sub.id,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: null,
    currency: sub.currency ?? "usd",
    tier,
    raw_payload: event as unknown,
  });

  return { ok: true, action: "tier_updated" };
}

async function handleSubscriptionDeleted(
  admin: SupabaseClient,
  event: Stripe.Event,
): Promise<HandlerResult> {
  const sub = event.data.object as Stripe.Subscription;
  const cust = customerId(sub.customer);
  const profileId = await resolveProfileId(admin, { customerId: cust });

  if (profileId) {
    await admin.from("profiles").update({ patron_status: "canceled" }).eq("id", profileId);
  }

  await insertPatronEvent(admin, {
    user_id: profileId,
    stripe_customer_id: cust,
    stripe_subscription_id: sub.id,
    stripe_event_id: event.id,
    event_type: event.type,
    amount_cents: null,
    currency: sub.currency ?? "usd",
    tier: null,
    raw_payload: event as unknown,
  });

  return { ok: true, action: "marked_canceled" };
}
