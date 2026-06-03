/**
 * Stone Harbor — Story Series public API.
 *
 * Anything not exported here is internal. If you need a new public
 * function, export it from here AND mention it in lib/story/README.md.
 */

export type {
  StoryDepth,
  StoryPrompt,
  StoryTelemetry,
  MemberStoryInvitation,
  InvitationStatus,
  SurfaceContext,
  SurfaceResult,
} from "./types";

export { isFounderEmail } from "./founderGate";

export {
  pickNextPrompt,
  deriveTitleFromPrompt,
  MVP_MAX_DEPTH,
  DEFAULT_SKIP_COOLDOWN_DAYS,
} from "./surfacer";

export {
  fetchPromptPool,
  fetchInvitationHistory,
  createPendingInvitation,
  markInvitationAnswered,
  markInvitationSkipped,
  fetchPromptById,
  fetchInvitationById,
} from "./client";
