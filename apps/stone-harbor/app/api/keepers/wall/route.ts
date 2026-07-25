/**
 * GET /api/keepers/wall — the quiet wall of patrons who chose visibility
 * (SH-108, §8.4). Public. Returns first names only, alphabetical. No
 * count, no ids — the wall is a gentle presence, not a leaderboard.
 */

import { anonClient } from "@/lib/apiSupabase";

export const runtime = "nodejs";
export const revalidate = 60; // cache 60s

export async function GET() {
  const anon = anonClient();
  if (!anon) {
    return Response.json({ names: [] });
  }

  const { data, error } = await anon
    .from("visible_patrons")
    .select("first_name")
    .order("first_name", { ascending: true });

  if (error || !data) {
    // Fail soft — an empty wall is a fine fallback for a public page.
    return Response.json({ names: [] });
  }

  const names = data
    .map((r) => (r as { first_name: string | null }).first_name)
    .filter((n): n is string => !!n);

  return Response.json({ names });
}
