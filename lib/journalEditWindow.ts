/**
 * Stone Harbor — journal edit window policy.
 *
 * The window during which a member can refine the rendered text of
 * a just-saved journal entry. Original content is always preserved;
 * only the `content` field is editable, and only within this window.
 *
 * Centralized here so the UI ("show edit affordance?") and the save
 * handler ("reject stale edits") read from the same source. Future
 * changes to the policy — different window lengths by entry length,
 * a finer-grained boundary check, anything — happen in one file.
 */

export const JOURNAL_EDIT_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Returns true if the entry is still within its edit window.
 *
 * Inclusive at the boundary: an entry created exactly
 * JOURNAL_EDIT_WINDOW_MS milliseconds ago is still editable; a
 * millisecond later, it locks.
 *
 * Returns false for malformed timestamps so a corrupted row can
 * never accidentally re-enable editing.
 */
export function isWithinEditWindow(
  createdAt: string,
  nowMs: number = Date.now(),
): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return nowMs - created <= JOURNAL_EDIT_WINDOW_MS;
}
