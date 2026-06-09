import { createHash } from "node:crypto";

import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos — bearer-token verification for consumer hosts.
 *
 * Hosts (Stone Harbor, The Long Light, future partners) authenticate
 * to Eidos's HTTP surface with a long-lived bearer token. The token's
 * SHA-256 hash is stored in `eidos_consumer_tokens`; the plaintext is
 * never persisted server-side. This helper:
 *
 *   1. Parses the Authorization header.
 *   2. SHA-256-hashes the bearer plaintext (matching the DB hash
 *      function — `encode(digest(text, 'sha256'), 'hex')` in pgcrypto
 *      and `createHash('sha256').update(text).digest('hex')` in Node
 *      produce identical output for the same input).
 *   3. Looks up the hash in `eidos_consumer_tokens`, joined with the
 *      consumer row for a status check.
 *   4. Validates not-revoked, not-expired, scope present, consumer
 *      active.
 *   5. Updates `last_used_at` fire-and-forget so the caller doesn't
 *      pay latency for it.
 *
 * On failure, the result includes a `reason` enum the caller logs to
 * `eidos_ingest_log` for forensic attribution. The `token_prefix` is
 * surfaced even on most failure paths (everywhere the token was
 * recognized as a real DB row) so logs can attribute the request
 * without exposing the secret.
 *
 * Spec: stone-harbor-docs/engineering/eidos/Eidos_Behavioral_Inference_Architecture.md §4
 */

export type VerifyResult =
  | {
      ok: true;
      consumer_id: string;
      token_id: string;
      token_prefix: string;
    }
  | {
      ok: false;
      reason: VerifyFailureReason;
      token_prefix: string | null;
    };

export type VerifyFailureReason =
  | "missing_token"
  | "malformed_header"
  | "unknown_token"
  | "revoked"
  | "expired"
  | "insufficient_scope"
  | "consumer_inactive";

/**
 * Hash a plaintext bearer token with SHA-256, hex-encoded.
 * Exported for tests / debug only — never call this with a secret
 * value that lands in logs.
 */
export function hashBearerToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function verifyConsumerToken(
  authorizationHeader: string | null,
  requiredScope: string,
): Promise<VerifyResult> {
  if (!authorizationHeader) {
    return { ok: false, reason: "missing_token", token_prefix: null };
  }
  const match = authorizationHeader.match(/^Bearer\s+(\S+)$/);
  if (!match) {
    return { ok: false, reason: "malformed_header", token_prefix: null };
  }
  const plaintext = match[1];
  const tokenHash = hashBearerToken(plaintext);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("eidos_consumer_tokens")
    .select(
      "id, consumer_id, token_prefix, scopes, expires_at, revoked_at, eidos_consumers!inner(status)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "unknown_token", token_prefix: null };
  }

  const tokenPrefix = data.token_prefix as string;

  if (data.revoked_at) {
    return { ok: false, reason: "revoked", token_prefix: tokenPrefix };
  }
  if (data.expires_at && new Date(data.expires_at as string) <= new Date()) {
    return { ok: false, reason: "expired", token_prefix: tokenPrefix };
  }
  const scopes = (data.scopes as string[] | null) ?? [];
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      reason: "insufficient_scope",
      token_prefix: tokenPrefix,
    };
  }
  // Supabase JS join shape: nested object on the relation name.
  // Typing is loose because generated types aren't wired yet —
  // tracked as a follow-up.
  const consumerRow = (data as unknown as {
    eidos_consumers?: { status?: string } | null;
  }).eidos_consumers;
  const consumerStatus = consumerRow?.status;
  if (consumerStatus !== "active") {
    return {
      ok: false,
      reason: "consumer_inactive",
      token_prefix: tokenPrefix,
    };
  }

  // Fire-and-forget last_used_at update. Don't await — the route
  // response shouldn't block on this. Errors logged but swallowed.
  void supabase
    .from("eidos_consumer_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id as string)
    .then(({ error: updateError }) => {
      if (updateError) {
        // eslint-disable-next-line no-console
        console.error(
          "[eidos.auth] last_used_at update failed:",
          updateError.message,
        );
      }
    });

  return {
    ok: true,
    consumer_id: data.consumer_id as string,
    token_id: data.id as string,
    token_prefix: tokenPrefix,
  };
}
