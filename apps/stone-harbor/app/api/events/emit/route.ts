import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { emitEidosEvent, type EidosEventType } from "@/lib/eidos";

/**
 * Stone Harbor — Eidos event proxy endpoint.
 *
 * POST /api/events/emit
 * Authorization: Bearer <supabase access token>
 * Body: { type: EidosEventType; payload?: Record<string, unknown> }
 *
 * The browser cannot hold the Eidos consumer token (server-only by
 * design), so the client posts the *kind* of event here and we
 * forward it to the standalone Eidos engine with the consumer token
 * attached. The `user_id` Eidos sees is derived from the verified
 * Supabase session — clients cannot spoof events for other members.
 *
 * Like the other track-* endpoints in this app, this one is
 * deliberately quiet: every response is 204, never leaks failure
 * detail, and never throws. The member's journal save must not be
 * gated on this.
 *
 * Runs on Node so we can use the same fetch and crypto.randomUUID
 * Eidos itself expects. (Edge would also work, but Node is closer
 * to the engine's own runtime and avoids edge-vs-node JSON quirks.)
 */

export const runtime = "nodejs";

/**
 * Events the *client* is allowed to push. Server-internal events
 * (e.g. a future `safety_classifier.triggered` fired from a cron
 * job) must NOT be in this list — they should call emitEidosEvent
 * directly with a service-verified user_id.
 */
const CLIENT_ALLOWED_TYPES = new Set<EidosEventType>([
  "journal.created",
  "vent.created",
]);

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
    if (!token) return new NextResponse(null, { status: 204 });

    const body = (await req.json().catch(() => null)) as
      | { type?: string; payload?: unknown; event_id?: string }
      | null;
    if (!body || typeof body.type !== "string") {
      return new NextResponse(null, { status: 204 });
    }
    if (!CLIENT_ALLOWED_TYPES.has(body.type as EidosEventType)) {
      // Quiet rejection — clients have no business pushing other
      // types, and we don't want to advertise the allowlist either.
      return new NextResponse(null, { status: 204 });
    }
    const payload =
      body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    // Fire-and-forget against the Eidos engine. The helper never
    // throws; we await it so the route only returns once the
    // outbound POST has been attempted. (Returning before the await
    // would cut the request short on Vercel and lose the event.)
    await emitEidosEvent({
      type: body.type as EidosEventType,
      user_id: user.id,
      payload,
      event_id: typeof body.event_id === "string" ? body.event_id : undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
