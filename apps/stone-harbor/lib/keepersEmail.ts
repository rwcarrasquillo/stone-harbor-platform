/**
 * Stone Harbor — Lighthouse Keepers thank-you email (SH-108, §5.1 + §8.2).
 *
 * Sent from the Stripe webhook handler after a completed checkout
 * (subscription or one-time). Copy is the VERBATIM founder copy from
 * design brief §5.1, living in the `keepersEmail` namespace of
 * messages/en.json (both languages are held in that one namespace).
 *
 * Language selection (§8.2): if the patron is linked to a profile, use
 * profiles.known_languages to pick EN or ES; otherwise send bilingual
 * EN + ES, matching the auth-email discipline. The subtle bilingual
 * receipt block (§5.1, Q7) — amount · date · Stripe ref, cream-toned
 * #6b625a — is appended for every transaction regardless of language.
 *
 * Founder editorial pass on the copy is expected before the live-mode
 * flip (brief §11); this wires the mechanism against the current text.
 */

import { KEEPERS_FROM_EMAIL, getResend } from "@/lib/resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import enMessages from "@/messages/en.json";

type Lang = "en" | "es";

type ThankYouInput = {
  profileId: string | null;
  email: string | null;
  mode: "subscription" | "payment";
  tier: string | null;
  amountCents: number | null;
  currency: string;
  paymentRef: string;
};

type KeepersEmailNs = {
  subjectEn?: string;
  subjectEs?: string;
  receipt?: {
    amountEn?: string;
    dateEn?: string;
    amountEs?: string;
    dateEs?: string;
    ref?: string;
  };
  en?: Record<string, unknown>;
  es?: Record<string, unknown>;
};

const NS = (enMessages as unknown as { keepersEmail?: KeepersEmailNs }).keepersEmail ?? {};

// The manage-patronage link injected where the copy holds a
// "[Patron portal link]" / "[Enlace al portal de patrocinio]" token.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://stoneharbor.app";
const PORTAL_HREF = `${SITE_URL}/keepers`;
const PORTAL_TOKENS = ["[Patron portal link]", "[Enlace al portal de patrocinio]"];

function money(amountCents: number | null, currency: string): string {
  if (amountCents == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format(amountCents / 100);
}

function linkifyPortal(text: string): string {
  let out = text;
  for (const token of PORTAL_TOKENS) {
    out = out.split(token).join(
      `<a href="${PORTAL_HREF}" style="color:#7a6f60;text-decoration:underline;">${PORTAL_HREF}</a>`,
    );
  }
  return out;
}

/** Ordered string leaves of a section object → paragraphs. */
function paragraphs(section: Record<string, unknown> | undefined): string[] {
  if (!section) return [];
  const out: string[] = [];
  for (const v of Object.values(section)) {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") out.push(...paragraphs(v as Record<string, unknown>));
  }
  return out;
}

function renderLang(lang: Lang): string {
  const paras = paragraphs(lang === "en" ? NS.en : NS.es);
  return paras
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.6;color:#4a463f;font-size:15px;">${linkifyPortal(p)}</p>`,
    )
    .join("");
}

/** Bilingual receipt block, always rendered (§5.1). */
function receiptBlock(input: ThankYouInput): string {
  const r = NS.receipt ?? {};
  const amount = money(input.amountCents, input.currency);
  const now = new Date();
  const dateEn = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const dateEs = now.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });

  const enParts = [
    amount ? `${r.amountEn ?? "Amount"}: ${amount}` : "",
    `${r.dateEn ?? "Date"}: ${dateEn}`,
    `${r.ref ?? "Ref"}: ${input.paymentRef}`,
  ].filter(Boolean);
  const esParts = [
    amount ? `${r.amountEs ?? "Cantidad"}: ${amount}` : "",
    `${r.dateEs ?? "Fecha"}: ${dateEs}`,
    `${r.ref ?? "Ref"}: ${input.paymentRef}`,
  ].filter(Boolean);

  return (
    `<div style="margin-top:28px;text-align:right;color:#6b625a;font-size:12px;line-height:1.8;">` +
    `<div>${enParts.join(" · ")}</div>` +
    `<div>${esParts.join(" · ")}</div>` +
    `</div>`
  );
}

function chooseLangs(knownLanguages: string[] | null): Lang[] {
  if (!knownLanguages || knownLanguages.length === 0) return ["en", "es"]; // unlinked → bilingual
  const set = new Set(knownLanguages.map((l) => l.toLowerCase()));
  const hasEn = set.has("english") || set.has("en");
  const hasEs = set.has("spanish") || set.has("es") || set.has("español");
  if (hasEs && !hasEn) return ["es"];
  return ["en"]; // default English when English is known (or ambiguous)
}

export async function sendKeepersThankYou(
  admin: SupabaseClient,
  input: ThankYouInput,
): Promise<void> {
  if (!input.email) return; // nowhere to send

  let langs: Lang[] = ["en", "es"]; // default bilingual for unlinked patrons
  if (input.profileId) {
    const { data } = await admin
      .from("profiles")
      .select("known_languages")
      .eq("id", input.profileId)
      .maybeSingle();
    langs = chooseLangs((data?.known_languages as string[] | null) ?? null);
  }

  const body = langs
    .map((lang) => renderLang(lang))
    .join('<hr style="border:none;border-top:1px solid #e7e2d8;margin:28px 0;" />');

  const subject =
    langs[0] === "es"
      ? NS.subjectEs ?? "Gracias por sostener Stone Harbor"
      : NS.subjectEn ?? "Thank you for supporting Stone Harbor";

  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:8px;">${body}${receiptBlock(input)}</div>`;

  try {
    await getResend().emails.send({ from: KEEPERS_FROM_EMAIL, to: input.email, subject, html });
  } catch (e) {
    // Never fail the webhook because email delivery hiccuped — the
    // patron_events row is the source of truth; the email is a courtesy.
    console.error("sendKeepersThankYou failed", e);
  }
}
