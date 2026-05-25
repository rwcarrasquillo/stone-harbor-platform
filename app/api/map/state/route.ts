import { NextResponse } from "next/server";
import { requireUser, serviceClient } from "../_helpers";

/**
 * GET /api/map/state
 *
 * Returns the caller's current Eidos session state plus the chapters
 * already generated for them. The /map hub page calls this on mount
 * to decide what to render — a "begin your map" CTA, an in-progress
 * resume card, or the completed Operating Manual.
 *
 * Response shape:
 *   {
 *     session: EidosSessionState | null,
 *     chapters: { chapterNumber, language, generatedAt }[],
 *     completedModuleIds: string[]
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const svc = serviceClient();

  const { data: session } = await svc
    .from("eidos_sessions")
    .select(
      "user_id, current_week, current_module_id, status, started_at, last_active_at",
    )
    .eq("user_id", gate.userId)
    .maybeSingle();

  const { data: chapters } = await svc
    .from("eidos_chapters")
    .select("chapter_number, language, generated_at")
    .eq("user_id", gate.userId)
    .order("chapter_number", { ascending: true });

  // Distinct instruments the caller has completed responses for.
  // Used by the UI to render "Module 1.1 ✓" markers.
  const { data: responses } = await svc
    .from("eidos_responses")
    .select("instrument_id")
    .eq("user_id", gate.userId);

  const instrumentCounts = new Map<string, number>();
  for (const r of responses ?? []) {
    instrumentCounts.set(
      r.instrument_id,
      (instrumentCounts.get(r.instrument_id) ?? 0) + 1,
    );
  }

  // Map (instrument_id, expected_count) → module_id
  const EXPECTED_BY_INSTRUMENT: Record<string, { moduleId: string; expected: number }> = {
    phq2gad2: { moduleId: "1.1", expected: 4 },
    bfi10: { moduleId: "1.2", expected: 10 },
    schwartz: { moduleId: "1.3", expected: 10 },
    bpnsfs12: { moduleId: "1.4", expected: 12 },
  };
  const completedModuleIds: string[] = [];
  for (const [iid, count] of instrumentCounts.entries()) {
    const meta = EXPECTED_BY_INSTRUMENT[iid];
    if (!meta) continue;
    // 1.1 may be partially answered (skip allowed); consider it
    // "completed" if at least one response exists. Other modules
    // require all items.
    if (iid === "phq2gad2" || count >= meta.expected) {
      completedModuleIds.push(meta.moduleId);
    }
  }

  return NextResponse.json({
    session: session
      ? {
          userId: session.user_id,
          currentWeek: session.current_week,
          currentModuleId: session.current_module_id,
          status: session.status,
          startedAt: session.started_at,
          lastActiveAt: session.last_active_at,
        }
      : null,
    chapters: (chapters ?? []).map((c) => ({
      chapterNumber: c.chapter_number,
      language: c.language,
      generatedAt: c.generated_at,
    })),
    completedModuleIds,
  });
}
