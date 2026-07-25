import { Resend } from "resend";

/**
 * Stone Harbor — Resend SDK singleton (SH-108, Lighthouse Keepers).
 *
 * SH-17 wired Resend as Supabase Auth's SMTP provider (external config,
 * no SDK). This is the first place application code sends mail directly —
 * the Keepers webhook handler sends the thank-you email. Future
 * operational templates (welcome series, dunning) share this singleton.
 *
 * LAZY for the same build-safety reason as lib/stripe.ts: constructed on
 * first use so a build without RESEND_API_KEY (and the feature flag off)
 * doesn't crash. Server-only; the key never reaches the browser.
 */

import type { Resend as ResendType } from "resend";

let _resend: ResendType | null = null;

export function getResend(): ResendType {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  _resend = new Resend(key);
  return _resend;
}

export const KEEPERS_FROM_EMAIL = "Stone Harbor <support@stoneharbor.app>";
// Matches SH-17 auth email sender. Same Cloudflare Email Routing alias.
