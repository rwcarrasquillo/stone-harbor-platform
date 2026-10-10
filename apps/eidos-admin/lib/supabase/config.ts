/**
 * Eidos Admin — Supabase connection config (Eidos engine project).
 *
 * Server-only. The publishable key is used with the signed-in admin's own
 * session; this app never holds the service-role key.
 */
export function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.EIDOS_SUPABASE_URL;
  const key = process.env.EIDOS_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Session cookies are only ever read by the server in this app (no browser
 * Supabase client), so they can be HttpOnly.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};
