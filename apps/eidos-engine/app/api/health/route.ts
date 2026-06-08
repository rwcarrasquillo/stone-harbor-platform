import { NextResponse } from "next/server";

import pkg from "../../../package.json";

/**
 * Eidos Engine — healthcheck.
 *
 * Returns 200 with the running package version. Used by the deploy
 * contract (acceptance: https://eidos.stoneharbor.app/api/health → 200)
 * and by future uptime monitoring. Intentionally does NOT touch the
 * database — this probes that the app is up, not that Supabase is
 * reachable. A separate readiness probe can add a DB ping later.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", version: pkg.version });
}
