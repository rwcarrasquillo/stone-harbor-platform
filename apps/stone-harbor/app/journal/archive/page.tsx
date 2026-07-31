"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import { serif, sans } from "@/lib/fonts";
import { AnchorMark } from "@/app/components/anchorMark";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import { requireActiveSession } from "@/lib/authGuards";

/**
 * Stone Harbor — Journal Archive route (production).
 *
 * The full record of everything the member has written, displayed in
 * the harbor vocabulary. Companion surface to /journal:
 *   /journal         → writing + recent reading (last 6-7 entries on the strip)
 *   /journal/archive → the long memory (every entry, grouped by month)
 *
 * Click any archive card → returns to /journal?focus={id}, where the
 * focused entry loads in the reader pane. /journal handles the focus
 * param by fetching that entry alongside recent entries and setting
 * activeIdx to point at it. So the round-trip is:
 *
 *   /journal → "All entries →" (strip header) → /journal/archive
 *           → click an old entry → /journal?focus={old_id}
 *           → reader shows that entry, strip still shows recent context
 *
 * Composition (top → bottom, mirrors the harbor vocabulary):
 *   - Brand header (anchor + "Stone Harbor · Journal · Archive")
 *   - Anchor strip (ARCHIVE eyebrow + serif title)
 *   - Centered grid of entry cards (3 columns desktop, grouped by month
 *     with quiet italic date headings between groups)
 *   - Horizon mark + voice signature ("The harbor remembers.")
 *   - Crisis footer visible at the bottom (provided by layout)
 *
 * Gates:
 *   - Auth: redirect to /login if no user.
 *   - Suspension: redirect to /suspended if profiles.suspended_at set.
 *   - Empty state: a quiet centered note inviting the member to start
 *     writing if they've never made an entry.
 *
 * Data:
 *   - Supabase journal_entries, ordered by created_at DESC, limit 500.
 *     Pagination is a follow-up; the MVP cap is high enough to cover
 *     any realistic member collection in year one. If a member crosses
 *     500 entries we'll surface an "earlier years" affordance.
 *
 * Desktop-first. The grid drops to two columns at tablet and one at
 * mobile via CSS grid auto-fit; no client-side redirect.
 */

// ============================================================================
// Mood taxonomy — same shape as /journal/page.tsx
// ============================================================================
//
// Duplicated locally (rather than imported) to keep the archive page a
// self-contained surface. When the journal mood taxonomy moves to a
// shared module — which it should, eventually — both files will import
// from there. Until then, the two definitions must stay in sync.

type MoodTints = { dot: string; labelDusk: string; labelSunlit: string };

const MOODS: Record<string, MoodTints> = {
  sad:      { dot: "#3e5670", labelDusk: "#95b5d4", labelSunlit: "#3e5670" },
  grounded: { dot: "#586558", labelDusk: "#b0c4b0", labelSunlit: "#4a5648" },
  hopeful:  { dot: "#c4934e", labelDusk: "#e8c896", labelSunlit: "#a9793d" },
  strong:   { dot: "#8d6432", labelDusk: "#d4a974", labelSunlit: "#7a5226" },
  confused: { dot: "#9c8a6e", labelDusk: "#d4c5a9", labelSunlit: "#776654" },
  angry:    { dot: "#a05a3c", labelDusk: "#e8997a", labelSunlit: "#8c4a2e" },
  scared:   { dot: "#7d6ca2", labelDusk: "#bdaedb", labelSunlit: "#5e4d83" },
  numb:     { dot: "#8a8a8a", labelDusk: "#bababa", labelSunlit: "#5e5e5e" },
};

const MOOD_FALLBACK: MoodTints = MOODS.grounded;

function moodDotFor(mood: string | null): string {
  return (mood && MOODS[mood] ? MOODS[mood] : MOOD_FALLBACK).dot;
}

function moodLabelFor(mood: string | null, theme: "sunlit" | "dusk"): string {
  const tints = (mood && MOODS[mood]) || MOOD_FALLBACK;
  return theme === "sunlit" ? tints.labelSunlit : tints.labelDusk;
}

// ============================================================================
// DB entry shape + display helpers
// ============================================================================

type DBEntry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  created_at: string;
  edited_at: string | null;
  /** SH-73 — set when this entry came from a Story Series prompt. */
  story_invitation_id: string | null;
};

/**
 * Card date stamp — "SAT 13 JUN".
 *
 * The archive omits the TODAY/YESTERDAY shorthand the /journal strip
 * uses. On a long timeline view "TODAY" loses meaning the moment a
 * member scrolls; absolute dates anchor every card to its actual
 * place in the record.
 */
function formatCardDate(iso: string): string {
  const date = new Date(iso);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Card preview snippet — first ~120 chars of the first paragraph.
 * Slightly shorter than the journal sidebar preview because each
 * archive card is narrower in the 3-column grid layout.
 */
function previewFor(content: string): string {
  const firstPara = content.split(/\n\n+/)[0] || content;
  return firstPara.length > 120 ? `${firstPara.slice(0, 120)}…` : firstPara;
}

/**
 * Group entries by calendar month. Returns an ordered array of
 * { monthKey, entries[] } so the render can iterate naturally.
 *
 * monthKey is the first-of-month ISO timestamp (in the entries' own
 * timezone) — used both as the React key and as the input to
 * Intl.DateTimeFormat for the localized heading ("June 2026" / "Junio 2026").
 *
 * Input entries are assumed pre-sorted DESC by created_at, so the
 * resulting groups are also newest-month-first, with entries inside
 * each group newest-first.
 */
function groupByMonth(
  entries: DBEntry[],
): Array<{ monthKey: string; entries: DBEntry[] }> {
  const groups = new Map<string, DBEntry[]>();
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const monthKey = new Date(
      date.getFullYear(),
      date.getMonth(),
      1,
    ).toISOString();
    const existing = groups.get(monthKey);
    if (existing) {
      existing.push(entry);
    } else {
      groups.set(monthKey, [entry]);
    }
  }
  return Array.from(groups.entries()).map(([monthKey, entries]) => ({
    monthKey,
    entries,
  }));
}

// ============================================================================
// Page
// ============================================================================

export default function JournalArchivePage() {
  const { theme } = useTheme();
  const t = useTranslations("journal");
  const tMood = useTranslations("mood");
  const locale = useLocale();

  // null = loading, [] = empty, populated = ready
  const [entries, setEntries] = useState<DBEntry[] | null>(null);

  // Load every entry the member has written.
  //
  // Three-step guard mirrors /journal:
  //   1. Auth — no user → redirect to /login.
  //   2. Suspension — profiles.suspended_at set → redirect to /suspended.
  //   3. Fetch — up to 500 entries by created_at DESC.
  useEffect(() => {
    let cancelled = false;

    async function loadEntries() {
      // SH-110 — auth, suspension and settle-in in one call. The separate
      // suspended_at round-trip that used to sit here is gone; the guard
      // covers it.
      const session = await requireActiveSession();
      if (cancelled || !session) return;

      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, title, content, mood, created_at, edited_at, story_invitation_id")
        .eq("user_id", session.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[journal-archive] failed to load entries:", error);
        setEntries([]);
        return;
      }

      setEntries((data as DBEntry[]) ?? []);
    }

    void loadEntries();
    return () => {
      cancelled = true;
    };
  }, []);

  // ───── Loading state ─────
  if (entries === null) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-full w-full items-center justify-center text-[var(--sh-text-primary)]`}
      >
        <p
          className={`${serif.className} text-[16px] italic text-[var(--sh-text-tertiary)]`}
        >
          {t("archive.loading")}
        </p>
      </div>
    );
  }

  // ───── Empty state ─────
  // Quiet centered note. Members who reach the archive without any
  // entries are likely curious explorers; the message acknowledges
  // that and points them back to writing.
  if (entries.length === 0) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-full w-full flex-col items-center justify-center gap-6 px-10 text-[var(--sh-text-primary)]`}
      >
        <AnchorMark size={48} />
        <p
          className={`${serif.className} max-w-[480px] text-center text-[20px] italic leading-[1.4] text-[var(--sh-text-secondary)]`}
        >
          {t("archive.empty")}
        </p>
        <Link
          href="/journal"
          style={{ outline: "none", outlineOffset: 0 }}
          className={`${sans.className} mt-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)]`}
        >
          ← {t("archive.back")}
        </Link>
      </div>
    );
  }

  // ───── Loaded — render the archive ─────
  const monthGroups = groupByMonth(entries);

  // Locale-aware month + year heading ("June 2026" / "Junio 2026").
  // Created once per render rather than per group; the formatter is
  // identical for every heading.
  const monthFormatter = new Intl.DateTimeFormat(
    locale === "es" ? "es-ES" : "en-US",
    { month: "long", year: "numeric" },
  );

  return (
    <div
      // h-full + overflow-y-auto so the archive page scrolls within its
      // root-layout slot, leaving the body-level crisis footer visible
      // at the bottom of the viewport (same pattern as /journal).
      //
      // Transparent wrapper — the body's layered backdrop (sunlit warm
      // radial + paper grain, dusk gold ambient) paints through.
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Top header =====
            Same brand header as /journal, with the trailing word
            replaced by "Archive" so the member sees where they are
            in the journal's surface tree. Breadcrumb-style navigation:
              "Stone Harbor" → /dashboard (the room hub, app root)
              "Journal"      → /journal   (the parent surface)
              "Archive"      → current page (no link)
            Each crumb resolves to its conceptual parent. This page is
            read-only (no draft state), so no unsaved-changes guard is
            mounted here — the guard lives on the composer surfaces
            (/journal, /vent) where work can actually be lost. */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
              aria-label="Stone Harbor — Dashboard"
            >
              <AnchorMark size={32} />
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-primary)]`}
              >
                Stone Harbor
              </span>
            </Link>
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <Link
              href="/journal"
              style={{ outline: "none", outlineOffset: 0 }}
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-secondary)]`}
            >
              Journal
            </Link>
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
            >
              {t("archive.eyebrow")}
            </span>
          </div>

          {/* Quiet "back to journal" link in the top-right utility slot. */}
          <Link
            href="/journal"
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)]`}
          >
            ← {t("archive.back")}
          </Link>
        </header>

        {/* ===== Anchor strip =====
            Eyebrow + serif title centered on the page axis. Same
            rhythm as /journal's "Today's Prompt" strip so the two
            surfaces feel like one composition seen from different
            altitudes. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-8">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("archive.eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[24px] italic font-medium tracking-[-0.01em]`}
          >
            {t("archive.title")}
          </p>
        </section>

        {/* ===== Grid of entries =====
            Centered max-w-[1200px] (same width as the /journal strip
            and the /dashboard rooms carousel — the harbor vocabulary's
            common reading-width for card grids).

            CSS grid with `repeat(auto-fit, minmax(280px, 1fr))` gives:
              ≥ 1200px viewport → 4 columns
              ≥ 880px           → 3 columns
              ≥ 560px           → 2 columns
              < 560px           → 1 column
            No client-side breakpoint logic; the browser does the math.

            Vertical rhythm between month groups uses generous gap (gap-y-12)
            so each month reads as its own held moment rather than a list. */}
        <main className="flex flex-1 flex-col items-center px-10 py-10">
          <div className="flex w-full max-w-[1200px] flex-col gap-12">
            {monthGroups.map((group) => {
              const monthDate = new Date(group.monthKey);
              const heading = monthFormatter.format(monthDate);
              return (
                <section
                  key={group.monthKey}
                  className="flex flex-col gap-5"
                >
                  {/* Month heading — small italic serif in the muted
                      tertiary tone. The heading sits left-aligned within
                      the centered grid container so it reads as a label
                      for what follows, not a centered banner. */}
                  <h2
                    className={`${serif.className} text-[18px] italic font-medium tracking-[-0.005em] text-[var(--sh-text-tertiary)]`}
                  >
                    {heading.charAt(0).toUpperCase() + heading.slice(1)}
                  </h2>

                  {/* Grid of cards for this month. auto-fit + minmax keeps
                      the layout responsive without breakpoint media queries. */}
                  <div
                    className="grid gap-3"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(280px, 1fr))",
                    }}
                  >
                    {group.entries.map((entry) => (
                      <ArchiveEntryCard
                        key={entry.id}
                        entry={entry}
                        theme={theme}
                        untitledLabel={t("untitled")}
                        moodTranslator={tMood}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </main>

        {/* ===== Horizon mark + voice signature =====
            Same engraved-gold lens pair as /journal's CenteredHorizonMark,
            with a different voice line below — "The harbor remembers."
            instead of "The harbor is patient." Both lines are true; this
            surface is about memory rather than patience. */}
        <ArchiveHorizonMark voiceSignature={t("archive.voiceSignature")} />
      </div>
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * Archive entry card — the grid tile for a single past entry.
 *
 * Larger than the journal strip's EntryStripCard (which is fixed at
 * 160×94) because the archive isn't space-constrained. Each tile
 * carries the same elements as the strip (date stamp, mood dot/label,
 * title) PLUS a preview line — the archive is the surface where
 * "scanning" matters, so giving members the first sentence of each
 * entry helps them find what they're looking for.
 *
 * Click navigates to /journal?focus={id}. /journal handles that param
 * by fetching the focused entry alongside its usual recent fetch and
 * setting activeIdx to point at it.
 */
function ArchiveEntryCard({
  entry,
  theme,
  untitledLabel,
  moodTranslator,
}: {
  entry: DBEntry;
  theme: "sunlit" | "dusk";
  untitledLabel: string;
  moodTranslator: (key: string) => string;
}) {
  const titleText = entry.title?.trim() || untitledLabel;
  const previewText = previewFor(entry.content);

  return (
    <Link
      href={`/journal?focus=${entry.id}`}
      style={{ outline: "none", outlineOffset: 0 }}
      className={`flex flex-col gap-1.5 rounded-sm border border-transparent px-4 py-4 transition-colors hover:border-[var(--sh-border-subtle)] ${
        theme === "sunlit"
          ? "hover:bg-[rgba(196,147,78,0.04)]"
          : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: moodDotFor(entry.mood) }}
        />
        {/* SH-73 — same quiet gold dot the strip + sidebar card use
            to mark Story Series responses. Lives inline so a member
            scanning the archive can see the source of each entry
            at a glance. */}
        {entry.story_invitation_id && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#a9793d" }}
            title="A story to tell"
          />
        )}
        <span
          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
        >
          {formatCardDate(entry.created_at)}
        </span>
      </div>

      {entry.mood && (
        <span
          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.28em]`}
          style={{ color: moodLabelFor(entry.mood, theme) }}
        >
          {moodTranslator(entry.mood)}
        </span>
      )}

      <p
        className={`${serif.className} truncate text-[15px] font-medium leading-[1.25] tracking-[-0.005em] text-[var(--sh-text-primary)]`}
      >
        {titleText}
      </p>

      <p
        className={`${sans.className} line-clamp-2 text-[11px] leading-[1.5] text-[var(--sh-text-secondary)]`}
      >
        {previewText}
      </p>
    </Link>
  );
}

/**
 * Horizon mark for the archive's foot.
 *
 * Visually identical to /journal's CenteredHorizonMark — engraved-gold
 * lens segments + breathing anchor — with a different voice signature
 * passed in. Inline-defined here rather than imported to keep the
 * archive page self-contained while we iterate on its design. When
 * /journal and /journal/archive converge on the same horizon component,
 * we'll factor it into a shared module.
 */
function ArchiveHorizonMark({ voiceSignature }: { voiceSignature: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-10 pb-10 pt-8">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        {/* Left segment — fade in from outer edge to confident near the anchor. */}
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />

        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>

        {/* Right segment — mirror of left. */}
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>

      <p
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
