import type { NextRequest } from "next/server";

/**
 * Eidos Engine — admin API bearer-token verification.
 *
 * Distinct from `verifyConsumerToken`: that one authenticates host
 * platforms (Stone Harbor, The Long Light) for *writes* (event
 * ingestion) and is backed by `eidos_consumer_tokens` rows so each
 * host has its own credential.
 *
 * This one authenticates the *admin app* (apps/eidos-admin) for
 * *cross-consumer reads*. It's a single shared secret, not per-
 * consumer, because the admin surface is intentionally above the
 * consumer layer — it can read every consumer's data. Stored only in
 * the EIDOS_ADMIN_API_TOKEN env var; no DB row.
 *
 * If the admin surface ever grows to multiple distinct admin users
 * (clinical advisor, partner ops) with different scopes, this gets
 * promoted to a real `eidos_admin_tokens` table with per-actor rows
 * and scopes. For now: one var, one secret, one Rafael.
 */
export function verifyAdminToken(req: NextRequest): {
  ok: boolean;
  reason?: "unconfigured" | "missing" | "malformed" | "mismatch";
} {
  const expected = process.env.EIDOS_ADMIN_API_TOKEN;
  if (!expected) {
    return { ok: false, reason: "unconfigured" };
  }

  const auth = req.headers.get("authorization");
  if (!auth) {
    return { ok: false, reason: "missing" };
  }

  const match = auth.match(/^Bearer (.+)$/);
  if (!match) {
    return { ok: false, reason: "malformed" };
  }

  if (match[1].trim() !== expected) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}
