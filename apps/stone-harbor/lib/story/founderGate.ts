/**
 * Stone Harbor — founder gate for the Story Series MVP.
 *
 * The Story Series is gated to a single account during the first cycle
 * so we can collect telemetry from real usage (mine) before opening to
 * the therapist beta. This is M1 in the Milestone Roadmap.
 *
 * When the gate widens to the therapist beta (M2), this file becomes
 * a list of beta emails; eventually it folds into a flag on profiles
 * or a group-permission check and is removed.
 *
 * Architectural note: gating happens on the surfacing surfaces (the
 * dashboard card; the journal route handler) and NOT in the database.
 * Any authenticated member could technically write to
 * member_story_invitations via the RLS policies — that's intentional:
 * we want the data shape to support all members the moment we widen
 * the gate, without a schema change. The gate is a *product* gate, not
 * a security boundary.
 */

const FOUNDER_EMAILS: ReadonlyArray<string> = [
  "rafael.carrasquillo@gmail.com",
];

/**
 * @returns true if the email belongs to the founder pool. Case-insensitive.
 *          Returns false for null/undefined/empty.
 */
export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return FOUNDER_EMAILS.includes(normalized);
}
