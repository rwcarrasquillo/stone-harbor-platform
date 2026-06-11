import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAdminToken } from "@/lib/auth/verifyAdminToken";
import { getServiceClient } from "@/lib/supabase/server";

/**
 * Eidos Engine — `GET /api/v1/members`
 *
 * Lists every distinct (consumer_id, member_id) tuple that has
 * produced events, with event count and last-event timestamp. Used by
 * the apps/eidos-admin spot-check index. Auth: bearer
 * EIDOS_ADMIN_API_TOKEN.
 *
 * When this endpoint grows a consumer-scoped read path (a host
 * platform querying its own members), the auth branch fans out: admin
 * token → return all consumers; consumer token with `events:read`
 * scope → return only that consumer's members. For v1, admin only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = verifyAdminToken(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: auth.reason },
      { status: auth.reason === "unconfigured" ? 500 : 401 },
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("eidos_event_stream")
    .select("consumer_id, user_id, timestamp")
    .order("timestamp", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }

  // Aggregate per (consumer, user). Tiny dataset; JS-side is fine.
  // When this grows past tens of thousands of events, replace with a
  // materialised view or RPC; the endpoint shape can stay the same.
  const byMember = new Map<
    string,
    {
      consumer_id: string;
      member_id: string;
      event_count: number;
      last_event: string;
    }
  >();
  for (const row of data ?? []) {
    const key = `${row.consumer_id}::${row.user_id}`;
    const existing = byMember.get(key);
    if (existing) {
      existing.event_count += 1;
    } else {
      byMember.set(key, {
        consumer_id: row.consumer_id as string,
        member_id: row.user_id as string,
        event_count: 1,
        last_event: row.timestamp as string,
      });
    }
  }

  const members = Array.from(byMember.values()).sort((a, b) =>
    a.last_event < b.last_event ? 1 : -1,
  );

  return NextResponse.json({ members });
}
