/**
 * Stone Harbor — mood taxonomy.
 *
 * The six top-level moods used in the journal mood picker. Sub-moods
 * (resentful, hurt, frustrated, etc.) live in app/components/subMoods.tsx
 * and are tied to these parent labels.
 *
 * If you need to add or rename a mood, do it here AND in the
 * journal page's moodOptions array. Mood is stored on
 * journal_entries.mood as plain text; there's no enum constraint in
 * the database so the taxonomy can evolve.
 */

export type Mood =
  | "grounded"
  | "confused"
  | "angry"
  | "sad"
  | "hopeful"
  | "strong";

/**
 * The full set of moods in the order the chips appear. Useful for
 * iteration in selectors / charts.
 */
export const MOODS: readonly Mood[] = [
  "grounded",
  "confused",
  "angry",
  "sad",
  "hopeful",
  "strong",
] as const;
