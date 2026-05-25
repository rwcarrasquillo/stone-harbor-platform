/**
 * /api/map/* — shared helpers.
 *
 * These wrap the Supabase clients and the auth gate that every route
 * under /api/map uses. Keeping them in one place means the routes
 * themselves stay short and the auth + error-shape conventions are
 * consistent.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Used inside API routes that need to
 * bypass RLS — e.g. to write to eidos_layer_scores (which is a
 * read-only table from the member side) or to write to
 * eidos_safety_events (admin-only).
 *
 * NEVER expose this client to the browser. NEVER pass its return
 * value to client components.
 */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY missing — required for /api/map/*.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Require a signed-in member. Returns the user's id, or a 401
 * response if the caller is anonymous.
 *
 * The request must carry a Supabase access-token header
 * (Authorization: Bearer <jwt>) — the member app's client sends this
 * automatically when calling fetch() to a same-origin API route from
 * an authenticated page.
 */
export async function requireUser(
  req: Request,
): Promise<{ userId: string } | { response: NextResponse }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return {
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  const svc = serviceClient();
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) {
    return {
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      ),
    };
  }
  return { userId: data.user.id };
}

export function err(status: number, code: string, message?: string) {
  return NextResponse.json(
    { error: code, message: message ?? code },
    { status },
  );
}
