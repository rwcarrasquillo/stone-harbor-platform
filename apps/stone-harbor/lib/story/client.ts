/**
 * Stone Harbor — Story Series DB access (client / RSC).
 *
 * Thin wrappers around the supabase anon client. RLS handles
 * authorization — each query relies on auth.uid() = member_id for
 * member_story_invitations writes/reads, and on active=true for
 * prompt reads.
 *
 * All functions are typed to return the canonical TS shapes from
 * ./types so callers never deal with `any`.
 *
 * Convention: every function takes the supabase client as the first
 * arg so tests can swap in a mock and so server-side callers (Route
 * Handlers, server actions) can pass a service-role client when
 * needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MemberStoryInvitation,
  StoryPrompt,
  StoryTelemetry,
} from "./types";

const STONE_HARBOR_CONSUMER = "stone_harbor";
const DEFAULT_LANGUAGE = "en";

/**
 * Fetch the active prompt pool for a (consumer, language, series).
 * Defaults to Stone Harbor + English. Returns all depth levels;
 * surfacer caps depth, not this fetch.
 */
export async function fetchPromptPool(
  client: SupabaseClient,
  opts: {
    seriesSlug: string;
    consumerSlug?: string;
    language?: string;
  }
): Promise<StoryPrompt[]> {
  const { data, error } = await client
    .from("story_prompts")
    .select(
      "id, consumer_slug, language, series_slug, prompt_text, depth, themes, est_minutes, re_surface_eligible, order_hint, active, source_ref, regional_variants"
    )
    .eq("consumer_slug", opts.consumerSlug ?? STONE_HARBOR_CONSUMER)
    .eq("language", opts.language ?? DEFAULT_LANGUAGE)
    .eq("series_slug", opts.seriesSlug)
    .eq("active", true)
    .order("depth", { ascending: true })
    .order("order_hint", { ascending: true });

  if (error) throw error;
  return (data ?? []) as StoryPrompt[];
}

/**
 * Fetch the member's invitation history for the given prompt pool.
 * Filters by the candidate prompt_ids so we don't accidentally read
 * invitations for other consumers (RLS already prevents reads of
 * other members' rows).
 */
export async function fetchInvitationHistory(
  client: SupabaseClient,
  memberId: string,
  promptIds: string[]
): Promise<MemberStoryInvitation[]> {
  if (promptIds.length === 0) return [];

  const { data, error } = await client
    .from("member_story_invitations")
    .select(
      "id, member_id, prompt_id, status, shown_at, responded_at, snooze_until, response_journal_entry_id, telemetry, created_at, updated_at"
    )
    .eq("member_id", memberId)
    .in("prompt_id", promptIds)
    .order("shown_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MemberStoryInvitation[];
}

/**
 * Insert a new pending invitation for (member, prompt). The DB defaults
 * status='pending' and shown_at=now(). Returns the inserted row.
 *
 * Concurrent dashboard loads could race and create two pending
 * invitations for the same prompt. That's tolerable for MVP — the
 * answered/skipped lifecycle still works per-row. If we see it in
 * practice, add a partial unique index on (member_id, prompt_id)
 * WHERE status='pending'.
 */
export async function createPendingInvitation(
  client: SupabaseClient,
  memberId: string,
  promptId: string
): Promise<MemberStoryInvitation> {
  const { data, error } = await client
    .from("member_story_invitations")
    .insert({ member_id: memberId, prompt_id: promptId })
    .select(
      "id, member_id, prompt_id, status, shown_at, responded_at, snooze_until, response_journal_entry_id, telemetry, created_at, updated_at"
    )
    .single();

  if (error) throw error;
  return data as MemberStoryInvitation;
}

/**
 * Mark an invitation as answered, linking to the journal entry that
 * holds the response prose, and persisting the engagement telemetry.
 *
 * Telemetry is merged shallowly (the route handler typically supplies
 * the full object captured in one writing session).
 */
export async function markInvitationAnswered(
  client: SupabaseClient,
  invitationId: string,
  responseJournalEntryId: string,
  telemetry: StoryTelemetry
): Promise<void> {
  const { error } = await client
    .from("member_story_invitations")
    .update({
      status: "answered",
      responded_at: new Date().toISOString(),
      response_journal_entry_id: responseJournalEntryId,
      telemetry,
    })
    .eq("id", invitationId);

  if (error) throw error;
}

/**
 * Mark an invitation as skipped with a cooldown window. Surfacer
 * uses snooze_until to suppress the prompt during the cooldown.
 */
export async function markInvitationSkipped(
  client: SupabaseClient,
  invitationId: string,
  cooldownDays: number
): Promise<void> {
  const snoozeUntil = new Date(
    Date.now() + cooldownDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await client
    .from("member_story_invitations")
    .update({
      status: "skipped",
      responded_at: new Date().toISOString(),
      snooze_until: snoozeUntil,
    })
    .eq("id", invitationId);

  if (error) throw error;
}

/**
 * Fetch a single prompt by id (used by /journal?prompt_id=X to render
 * the prompt header above the composer).
 */
export async function fetchPromptById(
  client: SupabaseClient,
  promptId: string
): Promise<StoryPrompt | null> {
  const { data, error } = await client
    .from("story_prompts")
    .select(
      "id, consumer_slug, language, series_slug, prompt_text, depth, themes, est_minutes, re_surface_eligible, order_hint, active, source_ref, regional_variants"
    )
    .eq("id", promptId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as StoryPrompt | null;
}

/**
 * Fetch a single invitation by id. Returns null if it doesn't exist or
 * RLS hides it (not member's own).
 */
export async function fetchInvitationById(
  client: SupabaseClient,
  invitationId: string
): Promise<MemberStoryInvitation | null> {
  const { data, error } = await client
    .from("member_story_invitations")
    .select(
      "id, member_id, prompt_id, status, shown_at, responded_at, snooze_until, response_journal_entry_id, telemetry, created_at, updated_at"
    )
    .eq("id", invitationId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as MemberStoryInvitation | null;
}
