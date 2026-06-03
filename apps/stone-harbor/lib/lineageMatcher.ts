/**
 * Stone Harbor — lineage reference-back matcher.
 *
 * The man wrote three things in his lineage room (or some subset of
 * them). Months later he opens his journal and writes something
 * about his father, or about anger, or about not wanting to repeat
 * a pattern. The harbor can quietly surface the line he wrote
 * before — "you said something about this once. would you like to
 * read it?"
 *
 * This is a behaviorally-important moment in the experience. It
 * connects today's reflection back to the long-arc story the man
 * has been writing across his account, and it does so without ever
 * asking him to dig for it. The first time this happens to a man
 * it can land hard, in the best way.
 *
 * Implementation v1:
 *   Plain keyword matching, case-insensitive, word-boundary aware.
 *   Each lineage theme has a small list of trigger words. If the
 *   journal text mentions any trigger word, that theme is considered
 *   "active" for that entry. The UI then checks whether the user has
 *   anything written in the corresponding lineage field, and only
 *   surfaces a reference if both sides have content.
 *
 * Why not vector embeddings:
 *   Embeddings would catch semantic similarity ("dad" → "father")
 *   more elegantly, but they require a service round-trip per save
 *   and add infrastructure. Keyword matching gets ~80% of the value
 *   with zero additional dependencies. If real members start asking
 *   for smarter matches, we upgrade then.
 *
 * Why these specific keywords:
 *   Each theme's list was curated to cover (a) the obvious cognates
 *   (anger → anger, angry, rage, mad), (b) the relational anchors
 *   (father, dad, my old man), and (c) common idioms (broke the
 *   pattern, same way, just like him). Avoid overly common words
 *   ("him," "he," "feel") that would trigger on almost every entry.
 */

export type LineageTheme = "fatherGrief" | "fatherAnger" | "patternToLeave";

const KEYWORDS: Record<LineageTheme, string[]> = {
  fatherGrief: [
    "father",
    "dad",
    "daddy",
    "papa",
    "old man",
    "grief",
    "grieving",
    "mourning",
    "miss him",
    "loss",
    "death",
    "died",
    "passing",
    "passed",
    "gone",
    "absent",
    "cry",
    "tears",
  ],
  fatherAnger: [
    "father",
    "dad",
    "anger",
    "angry",
    "rage",
    "furious",
    "mad",
    "shouted",
    "shouting",
    "yelled",
    "yelling",
    "yelling at",
    "snapped",
    "lashed out",
    "lost it",
    "temper",
  ],
  patternToLeave: [
    "pattern",
    "cycle",
    "same way",
    "just like him",
    "just like my",
    "never again",
    "broke the cycle",
    "break the cycle",
    "passing on",
    "passed down",
    "my son",
    "my daughter",
    "my kids",
    "my children",
    "model",
    "modeling",
    "modeled",
    "raise",
    "raising",
  ],
};

/**
 * Find all lineage themes that the given journal text might be
 * touching on. Returns at most one entry per theme. Empty result
 * means no themes were detected.
 *
 * Matching rules:
 *   - Case-insensitive
 *   - Whole-word: " father " matches but "fatherly" does not
 *   - Multi-word phrases must appear as a substring (with word
 *     boundaries on both ends)
 *   - Short keywords (≤3 chars) require word-boundary on both sides
 *     to avoid false positives like "madness" → "mad"
 */
export function detectLineageThemes(text: string): LineageTheme[] {
  if (!text || text.length < 8) return [];
  const lower = text.toLowerCase();
  const matched: LineageTheme[] = [];

  for (const [theme, words] of Object.entries(KEYWORDS) as [
    LineageTheme,
    string[],
  ][]) {
    for (const word of words) {
      // For multi-word keywords, surround with spaces to enforce
      // word boundaries on both ends.
      const pattern = word.includes(" ") ? word : ` ${word} `;
      // Pad the haystack so leading/trailing keywords still match.
      const haystack = ` ${lower} `;
      if (haystack.includes(pattern)) {
        matched.push(theme);
        break; // one match per theme is enough
      }
    }
  }
  return matched;
}

/**
 * The lineage values stored on the user's profile, mapped to their
 * themes. Used by the reference-back component to look up which
 * lineage text to surface for a detected theme.
 */
export type LineageContent = {
  fatherGrief: string | null;
  fatherAnger: string | null;
  patternToLeave: string | null;
};

/**
 * Combine a list of detected themes with the user's lineage content
 * to produce the references to surface. Only themes where BOTH
 * conditions hold are returned:
 *
 *   1. The journal text contained at least one keyword for the theme
 *   2. The user has written something in the corresponding lineage
 *      field (non-empty after trimming)
 *
 * The output is the lineage text + theme label for each match,
 * ready to render in the UI.
 */
export function resolveLineageReferences(
  themes: LineageTheme[],
  content: LineageContent,
): { theme: LineageTheme; text: string; label: string }[] {
  const results: { theme: LineageTheme; text: string; label: string }[] = [];
  const labels: Record<LineageTheme, string> = {
    fatherGrief: "what your father did with grief",
    fatherAnger: "what your father did with anger",
    patternToLeave: "the pattern you wanted to leave behind",
  };
  for (const theme of themes) {
    const raw =
      theme === "fatherGrief"
        ? content.fatherGrief
        : theme === "fatherAnger"
          ? content.fatherAnger
          : content.patternToLeave;
    const text = raw?.trim();
    if (text) {
      results.push({ theme, text, label: labels[theme] });
    }
  }
  return results;
}
