import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { markSecretRotated } from "@/lib/engine";

/**
 * Eidos Admin — server proxy: `POST /api/security/[id]/mark-rotated`.
 *
 * The browser POSTs here from the /security SecretRow client
 * component. We forward to the engine's `/api/v1/admin/secrets/[id]/mark-rotated`
 * route using `EIDOS_ADMIN_API_TOKEN` server-side. The token never
 * reaches the client — same pattern as the Stone Harbor → Eidos push
 * helper (server-only).
 *
 * Auth at this layer is the Supabase admin session (middleware already
 * enforces an active eidos_admin_users row and a TOTP-verified session). If middleware lets the request
 * through, we trust it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "bad_request", detail: "missing id" },
      { status: 400 },
    );
  }

  type Body = { notes?: string };
  const body = (await req.json().catch(() => ({}))) as Body;

  try {
    const result = await markSecretRotated(id, body.notes);
    return NextResponse.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "engine_call_failed", detail },
      { status: 502 },
    );
  }
}
