import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — shared caller authorization for edge functions (SH-154).
 *
 * These functions are deployed with verify_jwt = false: the platform's JWT
 * gate only understands the legacy JWT keys and rejects the new sb_secret_
 * key. So each function authorizes its caller here instead, and only two
 * kinds of caller are allowed:
 *
 *   1. Server / cron — the `apikey` header carries the project secret key
 *      (pg_cron via vault, and function-to-function calls such as
 *      generate-blog-posts → score-blog-draft).
 *   2. Admin — `Authorization: Bearer <user JWT>` for a signed-in user who
 *      has an admin_accounts row (the admin app's supabase.functions.invoke).
 *
 * Anything else, including the public publishable key on its own, gets 401.
 */

/** The new secret key, falling back to the legacy service-role key. */
export function secretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const key = JSON.parse(raw)?.default;
      if (typeof key === "string" && key) return key;
    } catch (_) {
      // fall through to the legacy key
    }
  }
  // TODO(SH-149 phase 8): drop this fallback once the legacy keys are
  // deactivated.
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Caller =
  | { kind: "server" }
  | { kind: "admin"; userId: string };

/**
 * Returns the authorized caller, or a 401 Response to return immediately.
 * `supabase` must be the function's secret-key client.
 */
export async function authorizeCaller(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<Caller | Response> {
  const apikey = req.headers.get("apikey") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  const secret = secretKey();
  if (secret && apikey && safeEqual(apikey, secret)) return { kind: "server" };

  // TODO(SH-149 phase 8): remove. Lets pg_cron keep using the legacy
  // service-role key (Authorization: Bearer) until its vault secret and
  // job headers are switched to the new key.
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy && ((bearer && safeEqual(bearer, legacy)) || (apikey && safeEqual(apikey, legacy)))) {
    return { kind: "server" };
  }

  if (bearer) {
    const { data: { user } } = await supabase.auth.getUser(bearer);
    if (user) {
      const { data: row } = await supabase
        .from("admin_accounts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (row) return { kind: "admin", userId: user.id };
    }
  }

  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
