/**
 * POST /api/keepers/wall-visibility — a patron opts in or out of the
 * quiet wall, and optionally sets a display name override (SH-108, §8.5).
 * Auth required.
 *
 * Body: { visible: boolean, wallName?: string }
 *   - visible  → profiles.patron_wall_visible
 *   - wallName → profiles.patron_wall_name (empty string → NULL, so the
 *     view falls back to the display_name / full_name cascade)
 */

import { adminClient, apiError, getBearerUser } from "@/lib/apiSupabase";

export const runtime = "nodejs";

type Body = { visible?: unknown; wallName?: unknown };

export async function POST(req: Request) {
  const user = await getBearerUser(req);
  if (!user) {
    return apiError(401, "unauthorized");
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return apiError(400, "invalid_json", "Could not parse request body.");
  }

  if (typeof body.visible !== "boolean") {
    return apiError(400, "invalid_visible", "`visible` must be a boolean.");
  }

  const admin = adminClient();
  if (!admin) {
    return apiError(500, "server_misconfigured");
  }

  const update: { patron_wall_visible: boolean; patron_wall_name?: string | null } = {
    patron_wall_visible: body.visible,
  };

  // Only touch the name when the caller sent one. Empty string → NULL.
  if (typeof body.wallName === "string") {
    const trimmed = body.wallName.trim();
    update.patron_wall_name = trimmed.length > 0 ? trimmed : null;
  }

  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error) {
    console.error("/api/keepers/wall-visibility update failed", error);
    return apiError(500, "update_failed", "We couldn't save your preference. Please try again.");
  }

  return Response.json({ ok: true });
}
