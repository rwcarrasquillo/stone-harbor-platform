import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { fetchOwnInferences } from "@/lib/eidos";

// Inlined here rather than imported from /api/map/_helpers because the
// Eidos route should not depend on the map module — they're different
// product surfaces that happen to share an auth pattern. If a second
// /api/* route grows the same need, fold this into a shared
// /api/_auth.ts at that point.
async function requireUser(
  req: Request,
): Promise<{ userId: string } | { response: NextResponse }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return {
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      response: NextResponse.json(
        { error: "server_config" },
        { status: 500 },
      ),
    };
  }
  const svc = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await svc.auth.getUser(token);
  if (error || !data.user) {
    return {
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { userId: data.user.id };
}

/**
 * Stone Harbor — `GET /api/eidos/inferences`
 *
 * Server proxy for the Rhythm surface (SH-40 v1). The browser POSTs
 * (well, GETs) here with the member's Supabase access token in the
 * Authorization header. We validate the token, extract the user_id
 * server-side, then call the Eidos engine using EIDOS_CONSUMER_TOKEN
 * (server-only env var) via `lib/eidos.ts → fetchOwnInferences`.
 *
 * This is the same three-layer pattern SH-36 established for the push
 * direction:
 *
 *   client (Rhythm page)
 *     → /api/eidos/inferences (this route, Supabase-auth gated)
 *       → fetchOwnInferences in lib/eidos.ts (server-only consumer token)
 *         → GET /api/v1/consumers/me/members/[user_id]/inferences (engine, EID-52)
 *
 * The consumer token never reaches the browser. The user_id is always
 * derived server-side from the verified Supabase session, never trusted
 * from the request body — same security posture as SH-36.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const result = await fetchOwnInferences(gate.userId);

  if (!result.ok) {
    // Forward a stable shape the page can switch on. We deliberately
    // don't surface the raw engine error detail to the browser — that
    // can include `unknown_token` or other internal reasons we'd
    // rather not echo to a client. The page renders a generic "Eidos
    // is still learning" placeholder for any error path, which is
    // also the right UX for the most likely real reason (no events
    // yet, no observation yet, baseline below threshold).
    if (result.reason === "not_found") {
      return NextResponse.json({ state: "no_events" }, { status: 200 });
    }
    return NextResponse.json(
      { state: "engine_error" },
      { status: 200 },
    );
  }

  return NextResponse.json({
    state: "ok",
    data: result.data,
  });
}
