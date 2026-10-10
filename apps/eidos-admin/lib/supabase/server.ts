import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SESSION_COOKIE_OPTIONS, getSupabaseConfig } from "./config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Supabase client for route handlers and server components, bound to the
 * request's cookies. Returns null when the Eidos Supabase env vars are
 * missing (callers show the "unconfigured" state).
 */
export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS }),
          );
        } catch {
          // Called from a server component, which can't set cookies. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
