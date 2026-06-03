/**
 * Stone Harbor — Story Series shared types.
 *
 * Cross-references: Eidos_Integration_Architecture_Memo_2026-05-28.md
 * Part 3.5 (story_prompts + story_responses) and Part 4.5 (multi-consumer).
 *
 * The on-disk shape lives in supabase/migrations/story_001_schema.sql.
 * This module is the TS mirror; if you change column types in SQL,
 * change them here.
 */

/** Depth taxonomy: 1=Shore, 2=Wading, 3=Channel, 4=Open Water. */
export type StoryDepth = 1 | 2 | 3 | 4;

/** Lifecycle status of an invitation surfaced to a member. */
export type InvitationStatus =
  | "pending"
  | "answered"
  | "skipped"
  | "snoozed"
  | "dismissed";

/** A row from public.story_prompts. */
export type StoryPrompt = {
  id: string;
  consumer_slug: string;
  language: string;
  series_slug: string;
  prompt_text: string;
  depth: StoryDepth;
  themes: string[];
  est_minutes: number | null;
  re_surface_eligible: boolean;
  order_hint: number | null;
  active: boolean;
  source_ref: string | null;
  regional_variants: Record<string, string>;
};

/** A row from public.member_story_invitations. */
export type MemberStoryInvitation = {
  id: string;
  member_id: string;
  prompt_id: string;
  status: InvitationStatus;
  shown_at: string;
  responded_at: string | null;
  snooze_until: string | null;
  response_journal_entry_id: string | null;
  telemetry: StoryTelemetry;
  created_at: string;
  updated_at: string;
};

/**
 * Engagement signals captured while the member writes the response.
 * Stored in member_story_invitations.telemetry (jsonb).
 *
 * All fields optional — partial telemetry is still useful signal.
 */
export type StoryTelemetry = {
  /** Milliseconds from prompt-shown to first keystroke. Surfaces hesitation. */
  time_to_first_keystroke_ms?: number;
  /** Total seconds spent actively writing (sum of typing windows). */
  total_writing_seconds?: number;
  /** Count of pauses ≥ 5s during writing. Surfaces effortfulness. */
  pauses_count?: number;
  /** Count of large deletions (≥ 10 chars). Surfaces revision. */
  deletes_count?: number;
  /** Final word count of saved response. */
  word_count?: number;
  /**
   * Member's answer to "How does this memory sit with you?" — captured
   * AFTER the writing. Different from the generic journal mood: this is
   * the felt-temperature of the memory itself, not the man's general
   * mood today. Lives in telemetry (not journal_entries.mood) so the
   * mood map continues to track present-tense daily mood cleanly.
   * Optional — null/undefined when the member declined to pick.
   */
  reflection_mood?:
    | "grounded"
    | "confused"
    | "angry"
    | "sad"
    | "hopeful"
    | "strong"
    | null;
};

/**
 * Inputs to the surfacer. Pure function — caller supplies all state,
 * surfacer makes no IO calls. Keeps the picker deterministic and
 * trivially unit-testable.
 */
export type SurfaceContext = {
  /** All active prompts in the pool for this consumer + language + series. */
  pool: StoryPrompt[];
  /** Member's full invitation history for this series. */
  history: MemberStoryInvitation[];
  /** Current time, ISO string. Defaults to now in DB calls; pass for tests. */
  now: Date;
  /** Cap on depth a member is eligible to receive. Defaults to 2 for MVP. */
  maxDepth: StoryDepth;
};

/**
 * Result of a surface call. Either:
 *   - { kind: "existing_pending", invitation }     — re-surface in-flight invite
 *   - { kind: "create", promptId }                  — caller should create a new invitation
 *   - { kind: "none" }                              — nothing eligible right now
 */
export type SurfaceResult =
  | { kind: "existing_pending"; invitation: MemberStoryInvitation }
  | { kind: "create"; promptId: string }
  | { kind: "none"; reason: string };
