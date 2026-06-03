/**
 * Stone Harbor — Story Series surfacer.
 *
 * Pure decision logic. Takes the prompt pool + member's invitation
 * history, returns either an in-flight pending invitation, a
 * promptId-to-create, or "none right now."
 *
 * Why pure: the surfacer is the most consequential piece of editorial
 * judgment in the platform. It decides what the harbor asks a man to
 * write about. We want this trivial to test, trivial to reason about,
 * and free of any IO so the same logic can later run server-side in
 * Eidos for behavioral signal generation.
 *
 * MVP rules (cross-references Dad_Story_Series_Prompt_Pool_v1.md
 * algorithm notes, simplified for the first cycle):
 *
 *   1. Cap depth at maxDepth (default 2). L3/L4 wait for later cycles.
 *   2. If a pending invitation exists, return it. Never compete with
 *      an in-flight one.
 *   3. Respect snooze: skip prompts whose most-recent invitation is
 *      still in cooldown (status='skipped' or 'snoozed' AND
 *      snooze_until > now).
 *   4. Exclude prompts already answered if not re_surface_eligible.
 *      If re_surface_eligible, allow but lower priority.
 *   5. Prefer un-shown prompts. Within that band, sort by depth ASC
 *      then order_hint ASC — earlier-in-pool first.
 *   6. Fallback: if every prompt is exhausted, return { kind: 'none' }.
 *
 * Theme distribution, anti-pattern guards, weekly frequency cap, etc.
 * are deferred. The harbor will surface at most one card per dashboard
 * load right now; the frequency-cap behavior is enforced upstream by
 * not re-surfacing an answered prompt until the next eligible window.
 */

import type {
  MemberStoryInvitation,
  StoryDepth,
  StoryPrompt,
  SurfaceContext,
  SurfaceResult,
} from "./types";

/**
 * Pick the next prompt to surface for a member.
 *
 * @param ctx pool + history + now + maxDepth
 * @returns SurfaceResult — caller is responsible for any DB write.
 */
export function pickNextPrompt(ctx: SurfaceContext): SurfaceResult {
  const { pool, history, now, maxDepth } = ctx;

  // 1. Active + within depth cap.
  const eligibleByDepth = pool.filter(
    (p) => p.active && p.depth <= maxDepth
  );
  if (eligibleByDepth.length === 0) {
    return { kind: "none", reason: "no prompts within depth cap" };
  }

  // 2. Existing pending invitation always wins.
  const pending = history.find((h) => h.status === "pending");
  if (pending) {
    return { kind: "existing_pending", invitation: pending };
  }

  // Helpers
  const promptById = new Map(eligibleByDepth.map((p) => [p.id, p]));
  const latestByPromptId = mostRecentByPrompt(history);

  // 3. Filter out prompts under cooldown OR already-answered-and-not-resurfaceable.
  const candidates: StoryPrompt[] = [];
  for (const prompt of eligibleByDepth) {
    const latest = latestByPromptId.get(prompt.id);

    if (!latest) {
      candidates.push(prompt); // never shown — strongest candidate
      continue;
    }

    if (latest.status === "answered") {
      if (prompt.re_surface_eligible) {
        candidates.push(prompt);
      }
      continue;
    }

    if (latest.status === "skipped" || latest.status === "snoozed") {
      if (!latest.snooze_until) {
        candidates.push(prompt);
        continue;
      }
      const snoozeUntil = new Date(latest.snooze_until).getTime();
      if (snoozeUntil <= now.getTime()) {
        candidates.push(prompt);
      }
      continue;
    }

    if (latest.status === "dismissed") {
      // Never re-surface after a hard dismiss.
      continue;
    }
  }

  if (candidates.length === 0) {
    return { kind: "none", reason: "all prompts in cooldown or exhausted" };
  }

  // 4. Sort: un-shown first, then depth ASC, then order_hint ASC.
  candidates.sort((a, b) => {
    const aShown = latestByPromptId.has(a.id) ? 1 : 0;
    const bShown = latestByPromptId.has(b.id) ? 1 : 0;
    if (aShown !== bShown) return aShown - bShown;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return (a.order_hint ?? 9999) - (b.order_hint ?? 9999);
  });

  const next = candidates[0];
  return { kind: "create", promptId: next.id };
}

/**
 * For each prompt_id, the most-recent invitation (by shown_at).
 * Used to evaluate the "current state" of a prompt for a member.
 */
function mostRecentByPrompt(
  history: MemberStoryInvitation[]
): Map<string, MemberStoryInvitation> {
  const map = new Map<string, MemberStoryInvitation>();
  for (const inv of history) {
    const existing = map.get(inv.prompt_id);
    if (!existing) {
      map.set(inv.prompt_id, inv);
      continue;
    }
    if (new Date(inv.shown_at).getTime() > new Date(existing.shown_at).getTime()) {
      map.set(inv.prompt_id, inv);
    }
  }
  return map;
}

/**
 * Derive a short, readable title from a prompt's text. Used to populate
 * `journal_entries.title` when a member writes a Story response, so the
 * entries list reads as a sequence of named pieces rather than untitled
 * fragments.
 *
 * Heuristic: take the full prompt text but cap at ~60 chars, breaking
 * on the nearest word boundary, and strip trailing punctuation. We do
 * NOT trim it down to a single noun phrase — the man may want to know
 * which prompt the entry answers when he scrolls back six months from
 * now, so we err on the side of more context.
 */
export function deriveTitleFromPrompt(promptText: string): string {
  const cleaned = promptText.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 60) return cleaned.replace(/[.!?…—–\-,;:]+$/, "");
  const slice = cleaned.slice(0, 60);
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = lastSpace > 30 ? slice.slice(0, lastSpace) : slice;
  return trimmed.replace(/[.!?…—–\-,;:]+$/, "") + "…";
}

/**
 * Default depth ceiling for the MVP cycle. L1+L2 only.
 * Centralized so we can lift it in one place when widening to L3/L4.
 */
export const MVP_MAX_DEPTH: StoryDepth = 2;

/**
 * Default cooldown after a "not today" skip. 7 days matches the
 * "one invitation per week" frequency cap in the algorithm design
 * notes. Configurable so the skip endpoint can shadow it.
 */
export const DEFAULT_SKIP_COOLDOWN_DAYS = 7;
