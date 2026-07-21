"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { serif, sans } from "@/lib/fonts";
import { EASE, cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { AnchorMark } from "@/app/components/anchorMark";
import { HairlineLens } from "@/app/components/hairlineLens";
import { HorizonSegment } from "@/app/components/horizonSegment";
import { useTheme } from "@/app/components/themeProvider";
import { UnsavedChangesModal } from "@/app/components/unsavedChangesModal";
import { supabase } from "@/lib/supabaseClient";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { isWithinEditWindow } from "@/lib/journalEditWindow";
import { deriveTitleFromPrompt } from "@/lib/story/surfacer";

/**
 * Stone Harbor — Journal route (production, centered design).
 *
 * Reading + writing on a single surface: the page is the harbor.
 * Members open the journal, read past entries, or click + NEW ENTRY
 * and the same center pane becomes editable inline. A draft card
 * appears in the entries strip and mirrors what they type live.
 * No route change, no surface change — one composed page.
 *
 * Composition (top → bottom):
 *   - Brand header (anchor + "Stone Harbor · Journal")
 *   - Today's Anchor strip (the daily prompt)
 *   - Reader pane with static 48vh height, max-w-[720px] body column
 *     - Actions row (Edit/Delete · ··· · or Save/Cancel when composing)
 *     - Static header (date stamp + mood meta + title)
 *     - Scrollable body (mask-fade at bottom into the horizon)
 *   - Compact horizon mark (engraved gold lens segments + breathing
 *     anchor + "The harbor is patient.")
 *   - Entries strip (7 cards, hairlines on active, click to switch)
 *   - Crisis footer visible at the bottom (h-full, not h-screen)
 *
 * Three reader modes:
 *   - reading   → static title + body, Edit/Delete/··· actions
 *   - composing → title input, body textarea, mood picker, draft
 *     card prepends to strip, Save/Cancel actions
 *   - editing   → same UI as composing, pre-populated with the entry
 *     being edited (within 6-hour window), supabase.update on Save
 *
 * Mobile (< 1024px) is redirected to /journal/compose where the
 * earlier creation/edit UI continues to live unchanged.
 *
 * Layout:
 *   - Brand mark header (anchor + "Stone Harbor · Journal")
 *   - Today's Anchor strip (the daily prompt line)
 *   - Two-pane: sidebar with 7 most recent entries + reader pane
 *   - Reader cross-fades between entries on sidebar selection
 *   - Entry closes with a wide engraved horizon mark (rule + anchor)
 *     and the voice signature "The harbor is patient."
 *
 * NOT rendered here (already provided by the root layout):
 *   - GlobalCrisisFooter (body-level, every authenticated route)
 *   - MobileTabBar (body-level, mobile-only)
 *   - ThemeProvider (provides useTheme + sets data-theme on <html>)
 *
 * Actions:
 *   - "+ New entry" → routes to /journal/compose (the full creation
 *     flow with prompts, mood selection, body check, Story Series).
 *   - Edit → routes to /journal/compose?edit={id}. The compose page
 *     loads that entry in edit mode. Edit button hides after the
 *     6-hour edit window closes (isWithinEditWindow from
 *     lib/journalEditWindow).
 *   - Delete → window.confirm + supabase.delete + refetch.
 *
 * Data:
 *   - Supabase journal_entries, ordered by created_at DESC, limit 7.
 *   - Mood values are stored lowercase in the DB; the MOODS lookup
 *     below is keyed by lowercase to match. Display labels translate
 *     via useTranslations("mood") for localization.
 *
 * Gates:
 *   - Auth: redirect to /login if no user.
 *   - Suspension: redirect to /suspended if profiles.suspended_at set.
 *   - Empty state: invite the member to write their first entry,
 *     routing them to /journal/compose.
 *
 * Desktop-first. Mobile responsiveness is a follow-up.
 */

// ============================================================================
// Mood taxonomy — theme-aware label tints, keyed by lowercase DB value
// ============================================================================
//
// Each mood carries a dot color (same across themes — the dot is a small
// solid disc that reads at any luminance) and TWO label colors: one
// brightened for dusk readability against near-black, and one deepened
// for sunlit readability against cream.
//
// Keys are LOWERCASE to match the DB enum ("sad" not "Sad"). Display
// strings come from useTranslations("mood") so they localize.

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

// Fallback tints for an entry whose mood is null or not in the table.
// We never want to render a colorless mood chip; an unknown value gets
// the grounded palette so the visual stays consistent.
const MOOD_FALLBACK: MoodTints = MOODS.grounded;

/**
 * Pick the right mood label color for the current theme.
 * Tolerates unknown/null mood values via the grounded fallback.
 */
function moodLabelFor(mood: string | null, theme: "sunlit" | "dusk"): string {
  const tints = (mood && MOODS[mood]) || MOOD_FALLBACK;
  return theme === "sunlit" ? tints.labelSunlit : tints.labelDusk;
}

function moodDotFor(mood: string | null): string {
  return (mood && MOODS[mood] ? MOODS[mood] : MOOD_FALLBACK).dot;
}

// ============================================================================
// DB entry shape + display helpers
// ============================================================================

/**
 * Subset of the journal_entries row we need for reading.
 * Matches the Supabase select() below, NOT the full DB schema.
 */
type DBEntry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  created_at: string;
  edited_at: string | null;
  /**
   * SH-73: When set, this entry answered a Story Series invitation.
   * Drives the quiet visual marker on the strip card + archive card so
   * a member can see which entries came from a prompt vs. freeform
   * writing. Null for every entry created before this feature shipped
   * and for any entry the member writes outside the Story flow.
   */
  story_invitation_id: string | null;
};

/**
 * Pending Story Series invitation that's driving compose mode. Set when
 * the page loads with `?invitation_id=X` in the URL. Cleared after the
 * member saves the entry (which transitions the invitation to
 * `answered` and back-links the entry id). Persists across the writing
 * session so the prompt text stays visible above the composer even as
 * the title is edited.
 */
type ActiveStoryInvitation = {
  invitationId: string;
  promptText: string;
};

/**
 * Sidebar date stamp.
 *   - same day  → "TODAY"
 *   - day prior → "YESTERDAY"
 *   - older     → "FRI 6 JUN" (3-letter day, day-of-month, 3-letter month)
 *
 * Uppercase to match the design's eyebrow typography. The reader pane
 * lowercases TODAY/YESTERDAY for its big italic stamp (see the reader
 * JSX), so we keep this string canonical and let the reader transform.
 */
/**
 * Strip-card date pill formatter. Locale-aware.
 *
 * Returns:
 *   - The localized "TODAY" / "YESTERDAY" label for same-day / previous-day entries
 *   - Otherwise the locale's short weekday + day + short month, uppercased
 *     (e.g. "SAT 13 JUN" for en, "SÁB. 13 JUN" for es).
 *
 * Two locale-aware paths instead of one — the today/yesterday labels
 * come from the i18n bundle (so editorial control), while the
 * weekday/month abbreviations come from Intl (so we don't have to
 * hand-translate a 7+12 array per locale we ever add).
 *
 * Callers must pass:
 *   - locale — from useLocale()
 *   - tDate — useTranslations("journal.dateLabel")
 *
 * The signature changed Jun 2026 from (iso) to (iso, locale, tDate)
 * during the Spanish-leak fix; the previous version produced English
 * sentinels regardless of app locale.
 */
function formatEntryDate(
  iso: string,
  locale: string,
  tDate: (key: string) => string,
): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  if (date >= startOfToday) return tDate("today");
  if (date >= startOfYesterday) return tDate("yesterday");

  // Intl handles the weekday/month abbreviations for any locale we
  // ever support. The display stays uppercase to match the strip
  // card's editorial style (small caps tracked wide).
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(date)
    .toUpperCase()
    .replace(/[.,]/g, "");
}

/**
 * Reader meta-row time stamp — e.g. "9:32 AM" (en) or "9:32" (es 24h).
 * Uses the APP locale (not the browser's) so the format follows the
 * member's chosen language, not the OS that happens to be in front
 * of them. The browser locale fallback (`undefined`) was producing
 * English-style 12h on /es journal for members on English systems.
 */
function formatEntryTime(iso: string, locale: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Sidebar preview snippet — the entry's first paragraph, truncated.
 * Line-clamp in the EntryCard CSS handles overflow visually, but we
 * pre-truncate so the DOM doesn't carry a long string when only ~120
 * chars will ever render.
 */
function previewFor(content: string): string {
  const firstPara = content.split(/\n\n+/)[0] || content;
  return firstPara.length > 180 ? `${firstPara.slice(0, 180)}…` : firstPara;
}

/**
 * Split entry body into paragraphs for the reader.
 * Splits on blank lines (double newline). Single newlines within a
 * paragraph are preserved as soft breaks via white-space CSS.
 */
function bodyParagraphs(content: string): string[] {
  return content.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

// ANCHOR_PHRASE moved into i18n (journal.anchorPhrase) on 2026-06-19
// during the partial-translation fix. The phrase used to live as a
// module-level constant here, which left it English-only on /es.

/**
 * Title size + line-height that fits the reader pane's max-w-[720px]
 * column. Discrete tiers (rather than continuous scaling) so a few
 * keystrokes don't bounce the size mid-type — the harbor picks a
 * size that fits the title and stays there for a stable range.
 *
 * Tier boundaries calibrated for the serif at the column width:
 *   - ≤ 24 chars  → 44px (short freeform titles: "Feeling Better Today")
 *   - 25–39 chars → 36px (longer freeform: "What did I carry with me…")
 *   - 40–55 chars → 28px (medium prompt titles)
 *   - ≥ 56 chars  → 22px (full derived prompt titles, e.g. "Write about
 *                          a moment from when you were small that you…")
 *
 * Both the reading-mode h1 and the composing/editing input read from
 * here so the title's optical weight matches across modes.
 */
function titleTypography(text: string): {
  fontSize: string;
  lineHeight: string;
} {
  const len = text.trim().length;
  if (len >= 56) return { fontSize: "22px", lineHeight: "1.3" };
  if (len >= 40) return { fontSize: "28px", lineHeight: "1.22" };
  if (len >= 25) return { fontSize: "36px", lineHeight: "1.15" };
  return { fontSize: "44px", lineHeight: "1.1" };
}

// ============================================================================
// Page
// ============================================================================

export default function JournalPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useTranslations("journal");
  const tDate = useTranslations("journal.dateLabel");
  const tMood = useTranslations("mood");
  // App locale (not browser locale) so the strip pills, big date
  // stamp, and reader-meta time all follow the member's chosen
  // language. The pre-2026-06-19 implementation used `undefined`
  // (browser default), which produced English-formatted
  // "7:55 AM" / "SAT 13 JUN" on /es/journal for any member whose
  // OS was in English. See SH-71-adjacent fix.
  const locale = useLocale();

  // Entry list state + active entry index. `entries === null` means
  // we're still loading; `entries.length === 0` is the empty state.
  const [entries, setEntries] = useState<DBEntry[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // ───── Unified compose/edit mode state ─────
  //
  // The reader pane has three modes:
  //   - 'reading'   → static display of an existing entry
  //   - 'composing' → writing a NEW entry inline; draft state lives
  //                   below and a virtual draft entry shows at the
  //                   leftmost position of the strip
  //   - 'editing'   → modifying an EXISTING entry within its 6-hour
  //                   window; draft state is initialized from the
  //                   entry's current content; editingForId points
  //                   to the entry being edited
  //
  // Save (compose mode)   → supabase.insert + refetch + back to reading
  // Save (editing mode)   → supabase.update(editingForId) + refetch
  // Cancel (either mode)  → drop draft, back to reading
  type Mode = "reading" | "composing" | "editing";
  const [mode, setMode] = useState<Mode>("reading");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftMood, setDraftMood] = useState<string | null>(null);
  const [editingForId, setEditingForId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // SH-73 — Story Series invitation that's driving compose mode.
  // Populated by the URL param effect below; cleared by the save
  // handler once the entry is persisted and the invitation transitions
  // to `answered`. The persistent prompt header in the reader pane
  // reads from this state so the question stays visible while the man
  // writes (he's writing TO the question, not from a blank page).
  const [activeStoryInvitation, setActiveStoryInvitation] =
    useState<ActiveStoryInvitation | null>(null);

  // Title textarea ref — drives the auto-grow behavior so long
  // pre-filled prompt titles wrap to multiple lines instead of
  // overflowing horizontally. The effect runs on every draftTitle
  // change AND on mode change so the textarea is correctly sized
  // both when first mounted with a pre-filled value and as the man
  // types/edits. Scrollheight + manual height reset is the same
  // pattern every autosize library uses; cheap and reliable.
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = titleTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [draftTitle, mode]);

  // ───── Unsaved-changes guard ─────
  //
  // The member is "dirty" (has work that would be lost on navigation)
  // when they're in a composer mode AND they've actually typed
  // something. A composing/editing mode with empty inputs doesn't
  // warrant interrupting navigation — confirming a confirm dialog
  // just to leave an empty draft is friction-only.
  //
  // The dirty signal feeds useUnsavedChangesWarning, which:
  //   - intercepts ALL in-app <Link> clicks at the DOM level (no
  //     per-link wiring needed — including the "Stone Harbor"
  //     breadcrumb and the "All entries →" archive link)
  //   - guards tab close / refresh / external nav via the browser's
  //     native beforeunload dialog
  // It surfaces showModal/cancelNavigation/confirmNavigation, which
  // we hand to the UnsavedChangesModal at the bottom of this page.
  const journalDirty =
    mode !== "reading" &&
    (draftContent.trim().length > 0 || draftTitle.trim().length > 0);
  const journalUnsaved = useUnsavedChangesWarning(journalDirty);

  // ───── Strip hover state ─────
  //
  // Parallels the dashboard rooms carousel pattern (RoomsCarousel on
  // /dashboard). When the member hovers any card on the entries strip,
  // that card gets the engraved-gold lens hairlines. When they move off
  // the strip entirely, the highlight returns to whichever card is
  // currently "active" (rendered in the reader pane).
  //
  //   null → no hover, highlight falls back to activeIdx
  //   -1   → hovering the NewEntryStripCard (sentinel for the "+ New
  //          entry" affordance; distinct from any real entry index)
  //   0..N → hovering the strip entry at that index
  //
  // The fallback target is `activeIdx` in all three modes:
  //   - reading   → the currently-rendered past entry
  //   - composing → 0 (which always points at the draft card)
  //   - editing   → the index of the entry being edited (handleEdit
  //                 doesn't change activeIdx, so it stays on that entry)
  // No mode-specific defaultIdx logic needed.
  const [hoveredStripIdx, setHoveredStripIdx] = useState<number | null>(null);

  // The virtual "draft entry" that appears in the strip while
  // composing. It mirrors the live draft state so as the member types
  // the title or picks a mood, the leftmost card on the strip fills
  // in real-time. Has a stable synthetic id so React reconciliation
  // doesn't churn during typing.
  const draftEntry: DBEntry | null =
    mode === "composing"
      ? {
          id: "__draft__",
          title: draftTitle || null,
          content: draftContent,
          mood: draftMood,
          created_at: new Date().toISOString(),
          edited_at: null,
          // SH-73 — Mirror the active invitation into the virtual
          // draft entry so the strip's leftmost card shows the same
          // gold dot as the saved row will after persist.
          story_invitation_id: activeStoryInvitation?.invitationId ?? null,
        }
      : null;

  // The strip's entries — with the draft prepended when composing.
  // activeIdx counts against THIS array, not the raw entries array.
  // When composing, activeIdx=0 always points at the draft.
  //
  // Past entries are capped at 6 in ALL modes so the total row of
  // cards (each 160px + 12px gap = 172px effective slot) fits inside
  // the max-w-[1200px] strip container regardless of which extra tile
  // occupies the leftmost slot:
  //
  //   reading   → [NewEntryStripCard, e0, e1, e2, e3, e4, e5]      = 7 cards = 1204px
  //   composing → [draftEntry,        e0, e1, e2, e3, e4, e5]      = 7 cards = 1204px
  //   editing   → [e0, e1, e2, e3, e4, e5, e6]                     = 7 cards = 1204px
  //                (no extra tile — strip just shows past entries)
  //
  // In editing mode there's no synthetic prepended card (the entry
  // being edited is still a real past entry in the list), so the
  // cap can relax to 7 there. Detecting the mode here would add
  // complexity for one extra card; uniform cap at 6 keeps the
  // geometry math clean and only costs the 7th-oldest entry's
  // visibility while editing. That entry is still in the database.
  //
  // The 7th-oldest entry temporarily falls off the visible strip in
  // reading and composing modes too. It's still in the database; it
  // reappears when more recent entries roll off (via aging or delete).
  const stripEntries: DBEntry[] = draftEntry
    ? [draftEntry, ...(entries ?? []).slice(0, 6)]
    : (entries ?? []).slice(0, 6);

  // Hover-follows-cursor highlight. Mirrors the dashboard RoomsCarousel
  // pattern: `hoveredIdx ?? defaultIdx`. The "default" here is whatever
  // entry is currently active in the reader pane, so when no card is
  // hovered, hairlines sit on the entry the member is looking at.
  const highlightedStripIdx = hoveredStripIdx ?? activeIdx;

  // (Earlier this file held a stripRef/cardRefs and a scroll-to-center
  // useEffect to drive a "static hairlines at center, carousel slides"
  // pattern. The pattern was elegant in the middle of the list but
  // looked unbalanced at the edges — and the most common landing
  // state is activeIdx=0 = the most recent entry = one of those
  // edges. Reverted to the simpler pattern where hairlines are a
  // property of the active card and follow it left-to-right. No refs
  // or scroll effects needed.)

  // Mobile redirect — the new reading-first design is desktop-only.
  // On mobile viewports (<1024px), the canonical journal surface
  // remains the existing creation/edit flow at /journal/compose,
  // unchanged from before this port. We redirect mobile users there
  // so the mobile experience matches what they had before.
  //
  // Why client-side rather than middleware: viewport detection isn't
  // available server-side, and a CSS-only "hide on mobile" approach
  // would still mount this page's effects (auth checks, Supabase
  // fetches) for no visible UI. A redirect is the cleanest separation.
  //
  // Threshold matches Tailwind's `lg` breakpoint (1024px) because the
  // two-pane layout (340px sidebar + ~1100px reader) only composes
  // properly above that width.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      router.replace("/journal/compose");
    }
  }, [router]);

  // Load entries on mount.
  //
  // Three-step guard (matches the existing /journal/compose page):
  //   1. Auth — no user → redirect to /login.
  //   2. Suspension — profiles.suspended_at set → redirect to /suspended.
  //   3. Fetch — depends on whether ?focus={id} is in the URL.
  //
  // Focus mode (?focus={id}):
  //   The member arrived here from /journal/archive, having clicked a
  //   specific past entry. We fetch that entry by id PLUS the 5 most
  //   recent OTHER entries, then sort the resulting up-to-6 entries
  //   DESC by created_at so the strip stays chronological. activeIdx
  //   is set to the focused entry's index in the merged list so the
  //   reader opens to it directly.
  //
  //   Limit is 5 (not 6) so we never exceed 6 total entries — keeps
  //   the strip at 7 cards (1 New Entry tile + 6 entry cards) and
  //   fits the max-w-[1200px] container without clipping. Cost: the
  //   6th-newest entry isn't shown while focus is active. That's
  //   acceptable; the focused entry is what the member came to read.
  //
  //   If the focused id can't be found (deleted, wrong user, malformed
  //   id), we silently fall back to the recent-only fetch so the page
  //   still renders.
  //
  // Default mode (no ?focus):
  //   Fetch the 7 most recent entries (same as before). The strip
  //   slice(0,6) trims to 6 visible past entries; activeIdx stays at 0
  //   so the reader shows the most recent.
  //
  // The `cancelled` flag stops the async work from setting state if
  // the component unmounts mid-fetch (e.g., user navigated away
  // before Supabase responded).
  useEffect(() => {
    let cancelled = false;

    // Read the focus param once at effect-start. SSR-safe via the
    // typeof check (Next.js may pre-render this page on the server
    // where window is undefined).
    const focusId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("focus")
        : null;

    async function loadEntries() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("suspended_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (profile?.suspended_at) {
        router.replace("/suspended");
        return;
      }

      setUserId(user.id);

      if (focusId) {
        // Two parallel queries: the focused entry by id, plus the 5
        // most recent OTHER entries. Promise.all keeps the network
        // latency at max(fetch1, fetch2) rather than fetch1+fetch2.
        const [focusedResult, recentResult] = await Promise.all([
          supabase
            .from("journal_entries")
            .select("id, title, content, mood, created_at, edited_at, story_invitation_id")
            .eq("user_id", user.id)
            .eq("id", focusId)
            .maybeSingle(),
          supabase
            .from("journal_entries")
            .select("id, title, content, mood, created_at, edited_at, story_invitation_id")
            .eq("user_id", user.id)
            .neq("id", focusId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);
        if (cancelled) return;

        const focusedEntry = focusedResult.data as DBEntry | null;
        const recentEntries = (recentResult.data as DBEntry[]) ?? [];

        if (focusedEntry) {
          // Merge + sort DESC by created_at so the focused entry slots
          // in chronologically alongside the recents.
          const merged = [focusedEntry, ...recentEntries].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          );
          setEntries(merged);

          // Point the reader at the focused entry so it opens there
          // instead of at index 0.
          const focusedIdx = merged.findIndex((e) => e.id === focusId);
          if (focusedIdx >= 0) setActiveIdx(focusedIdx);
        } else {
          // Focused id didn't resolve — fall back to the recent fetch
          // so the page still renders something useful.
          setEntries(recentEntries);
        }
        return;
      }

      // Default — no focus param, fetch top 7 most recent.
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, title, content, mood, created_at, edited_at, story_invitation_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(7);
      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[journal] failed to load entries:", error);
        setEntries([]);
        return;
      }

      setEntries((data as DBEntry[]) ?? []);
    }

    void loadEntries();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // SH-73 — Story Series invitation handoff.
  //
  // When a member arrives via the dashboard's "Write this story" CTA,
  // the URL carries `?invitation_id=<uuid>`. We resolve that to the
  // prompt text + invitation row, then prime the composer:
  //   - mode → "composing"
  //   - draftTitle ← deriveTitleFromPrompt(prompt.prompt_text) (editable)
  //   - activeStoryInvitation ← { invitationId, promptText }
  //
  // The persistent prompt header in the reader-pane JSX reads from
  // activeStoryInvitation so the question stays visible during the
  // entire write — the man is writing TO the question, not from a
  // blank page.
  //
  // Defensive behavior:
  //   - Bad invitation id (404, not member's, already answered, etc.)
  //     → fall through silently and let the journal open in regular
  //     reading mode. We don't want to throw an error toast at a man
  //     who clicked yes to writing.
  //   - Invitation belongs to a different member → RLS will return
  //     null. Same fallthrough.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const invitationId = new URLSearchParams(window.location.search).get(
      "invitation_id",
    );
    if (!invitationId) return;

    let cancelled = false;
    void (async () => {
      // Single round-trip: join the invitation row to its prompt row.
      // The story_prompts FK on member_story_invitations gives us the
      // nested select for free. RLS on member_story_invitations
      // restricts this read to the calling member's own rows.
      const { data, error } = await supabase
        .from("member_story_invitations")
        .select("id, status, prompt:story_prompts(prompt_text)")
        .eq("id", invitationId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        // eslint-disable-next-line no-console
        console.warn("[journal] invitation handoff failed:", error);
        return;
      }
      // Only prime compose mode when the invitation is actually still
      // pending. An already-answered or dismissed one falls through to
      // normal reading — the entry it produced is in the list.
      if (data.status !== "pending") return;
      // Supabase JS generates joined-row types as arrays even when the
      // join is a single-FK relation. We know member_story_invitations
      // → story_prompts is one-to-one, so flatten via unknown to keep
      // the runtime check below simple.
      const promptUnknown = data.prompt as unknown;
      const promptRow = Array.isArray(promptUnknown)
        ? (promptUnknown[0] as { prompt_text?: string } | undefined)
        : (promptUnknown as { prompt_text?: string } | null);
      if (!promptRow?.prompt_text) return;

      const promptText = promptRow.prompt_text;
      setActiveStoryInvitation({
        invitationId: data.id as string,
        promptText,
      });
      setDraftTitle(deriveTitleFromPrompt(promptText));
      setDraftContent("");
      setDraftMood(null);
      setMode("composing");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch — called after a delete so the sidebar reflects the
  // new state without a full page reload.
  async function refetchEntries() {
    if (!userId) return;
    const { data } = await supabase
      .from("journal_entries")
      .select("id, title, content, mood, created_at, edited_at, story_invitation_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(7);
    setEntries((data as DBEntry[]) ?? []);
    setActiveIdx(0); // After delete, snap to the most recent entry.
  }

  // ───── Loading state ─────
  // Quiet centered note while the entry list is in flight. The
  // "Opening your journal…" copy is the existing t("loading") key
  // already localized in en/es message catalogs.
  if (entries === null) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-screen w-full items-center justify-center text-[var(--sh-text-primary)]`}
      >
        <p
          className={`${serif.className} text-[16px] italic text-[var(--sh-text-tertiary)]`}
        >
          {t("loading")}
        </p>
      </div>
    );
  }

  // ───── Empty state ─────
  // First-time member — no entries yet. Reuses the existing
  // emptyTitle/emptySub keys (already localized) and routes the CTA
  // to /journal/compose so the writing flow opens fresh.
  if (entries.length === 0) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-screen w-full flex-col items-center justify-center gap-6 px-10 text-[var(--sh-text-primary)]`}
      >
        <AnchorMark size={48} />
        <h1
          className={`${serif.className} max-w-[520px] text-center text-[28px] italic leading-[1.15] tracking-[-0.01em]`}
        >
          {t("emptyTitle")}
        </h1>
        <p
          className={`${sans.className} max-w-[480px] text-center text-[14px] leading-[1.7] text-[var(--sh-text-secondary)]`}
        >
          {t("emptySub")}
        </p>
        <button
          type="button"
          onClick={() => router.push("/journal/compose")}
          style={{ outline: "none", outlineOffset: 0 }}
          className={`${sans.className} mt-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)]`}
        >
          + {t("newEntry")}
        </button>
      </div>
    );
  }

  // ───── Loaded — render the reader ─────
  // `reader` is the entry currently shown in the center pane. When
  // composing, it's the synthetic draft entry; when editing, it's
  // the real entry being modified; when reading, it's whichever entry
  // the activeIdx points at in the strip (counting the draft if
  // present).
  const reader = stripEntries[activeIdx] ?? stripEntries[0];
  const canEdit =
    reader.id !== "__draft__" && isWithinEditWindow(reader.created_at);

  // Delete handler — confirmation + supabase delete + local refetch.
  // We use the existing window.confirm pattern from the compose page
  // for consistency; a polished modal can replace this later.
  async function handleDelete() {
    if (typeof window === "undefined") return;
    if (reader.id === "__draft__") return; // Drafts can't be deleted.
    if (!window.confirm(`${t("delete")}?`)) return;
    const { error } = await supabase
      .from("journal_entries")
      .delete()
      .eq("id", reader.id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[journal] delete failed:", error);
      return;
    }
    await refetchEntries();
  }

  // Flip into editing mode for the currently-displayed entry. Loads
  // the entry's current title/content/mood into draft state; the
  // center pane re-renders with inputs in place of the static title
  // and body. On Save, supabase.update fires for `editingForId`.
  function handleEdit() {
    if (reader.id === "__draft__") return;
    if (!canEdit) return;
    setEditingForId(reader.id);
    setDraftTitle(reader.title ?? "");
    setDraftContent(reader.content);
    setDraftMood(reader.mood);
    setMode("editing");
  }

  // Flip into composing mode. A fresh draft state is seeded; the
  // draft entry prepends to the strip via stripEntries. activeIdx
  // snaps to 0 so the strip's leftmost card (the draft) is active.
  function handleNewEntry() {
    setEditingForId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftMood(null);
    setMode("composing");
    setActiveIdx(0);
  }

  // Discard the in-progress draft (or edit) and return to reading the
  // currently-active entry (which will be the first real entry after
  // the draft is removed).
  function handleCancel() {
    setMode("reading");
    setEditingForId(null);
    setDraftTitle("");
    setDraftContent("");
    setDraftMood(null);
    setActiveIdx(0);
    // SH-73 — abandoning the draft drops the Story Series handoff
    // state but does NOT mark the invitation as answered. Per founder
    // decision: the invitation stays `pending`, and the dashboard
    // surfacer will keep showing this same prompt next time. Only an
    // actual save transitions the lifecycle.
    setActiveStoryInvitation(null);
  }

  // Save the draft. Branches by mode:
  //   - composing → supabase.insert. On success, refetch entries
  //     (which will include the new row, sorted to the front by
  //     created_at desc) and return to reading mode with activeIdx=0.
  //   - editing   → supabase.update(editingForId) with title +
  //     content + edited_at. original_* fields are never touched,
  //     matching the compose page's edit behavior. On success,
  //     refetch and return to reading mode.
  async function handleSave() {
    if (saving) return;
    if (!userId) return;
    const trimmedContent = draftContent.trim();
    if (trimmedContent.length === 0) return; // Empty entries don't save.

    setSaving(true);
    try {
      if (mode === "composing") {
        const trimmedTitle = draftTitle.trim();
        // SH-73 — if this is a Story Series response, stamp the entry
        // with the invitation FK so the visual marker can render and
        // the invitation lifecycle can transition below.
        const { data: insertedRow, error } = await supabase
          .from("journal_entries")
          .insert({
            user_id: userId,
            title: trimmedTitle || null,
            original_title: trimmedTitle || null,
            content: trimmedContent,
            original_content: trimmedContent,
            mood: draftMood,
            story_invitation_id:
              activeStoryInvitation?.invitationId ?? null,
          })
          .select("id")
          .single();
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[journal] save (insert) failed:", error);
          return;
        }
        // SH-73 — close the loop on the invitation lifecycle.
        // Status transitions pending → answered, the response_journal_entry_id
        // back-link is populated, and responded_at is stamped. The
        // dashboard surfacer re-runs on its next mount and either
        // surfaces the next eligible prompt or hides the card.
        //
        // If this update fails, the journal entry still saves cleanly
        // (the invitation just stays pending — the surfacer's "existing
        // pending wins" rule will re-show the same prompt next time).
        // That's a recoverable degradation, so we log + continue rather
        // than throwing.
        if (activeStoryInvitation && insertedRow) {
          const { error: invitationError } = await supabase
            .from("member_story_invitations")
            .update({
              status: "answered",
              responded_at: new Date().toISOString(),
              response_journal_entry_id: insertedRow.id,
            })
            .eq("id", activeStoryInvitation.invitationId);
          if (invitationError) {
            // eslint-disable-next-line no-console
            console.warn(
              "[journal] invitation status update failed (entry saved OK):",
              invitationError,
            );
          }
          setActiveStoryInvitation(null);
        }
      } else if (mode === "editing" && editingForId) {
        const trimmedTitle = draftTitle.trim();
        const { error } = await supabase
          .from("journal_entries")
          .update({
            title: trimmedTitle || null,
            content: trimmedContent,
            edited_at: new Date().toISOString(),
          })
          .eq("id", editingForId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[journal] save (update) failed:", error);
          return;
        }
      }

      // Success path — clear draft, refetch entries, snap to first.
      await refetchEntries();
      setMode("reading");
      setEditingForId(null);
      setDraftTitle("");
      setDraftContent("");
      setDraftMood(null);
      setActiveIdx(0);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div
      // h-screen (not min-h-screen) on the outer wrapper locks the
      // preview to exactly the viewport height. This is required for
      // the inner body-text overflow-y-auto to have a bounded ceiling.
      // With min-h-screen the page could grow indefinitely on long
      // entries, and the body container would never reach a max height
      // to scroll within. Document scroll is suppressed so the only
      // movement the member sees is body text scrolling beneath the
      // fleuron banner — exactly the held-frame feel a journal asks for.
      //
      // The global crisis footer (mounted at body level) sits as the
      // body's trailing flex child. With h-screen here it pushes
      // document height to 100vh + footer, so there's a small natural
      // document scroll to reach the footer on shorter monitors. That's
      // acceptable: in the production /journal route the crisis footer
      // is part of the visible layout, and on standard desktops both
      // the locked page + footer fit together.
      // Transparent wrapper (no bg-page) so the body's layered backdrop
      // — sunlit's warm radial gradients + paper grain, defined in
      // globals.css — paints through this page. Painting bg-page here
      // would override that with flat cream and we'd lose the warmth.
      // Dusk's body uses a flat near-black via background-color, so
      // there's nothing visible behind a transparent wrapper there
      // either — both themes are served.
      //
      // h-full (was h-screen): the page now fills whatever vertical
      // space remains in its parent (the root layout's children
      // wrapper, flex-1 inside body's min-h-screen flex column). The
      // body-level GlobalCrisisFooter takes its natural height below;
      // the page takes the rest. Net effect: the 988 crisis band is
      // permanently visible at the bottom of the viewport without
      // requiring document scroll — which the original h-screen
      // pushed below the fold.
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-hidden text-[var(--sh-text-primary)]`}
    >
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col">
        {/* ===== Top header =====
            Brand cluster is wrapped in a Link to /dashboard — the
            standard harbor-vocabulary pattern. "Stone Harbor" reads as
            the breadcrumb root; clicking it returns the member to
            /dashboard (the room hub), regardless of the surface they're
            on. Unsaved-work protection sits at the DOM-click layer via
            useUnsavedChangesWarning + UnsavedChangesModal below — if
            the member has a draft in progress, the modal intercepts
            the click before navigation. */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
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
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
            >
              {t("brandCrumb")}
            </span>
          </Link>

          {/* Theme toggle lived here in the preview; on production the
              theme is controlled from Settings (ThemeProvider reads
              from cookie + Supabase profile). No toggle on this route. */}
        </header>

        {/* ===== Today's Anchor strip =====
            The daily prompt line. For now this is the same constant
            phrase used in the preview; future work can wire it to the
            existing daily-prompt source the compose page uses.
            Wrapped in a cascade motion.div so this is the first
            section to fade up after the static header on page mount —
            matches the harbor's house entrance pattern (lib/motion.ts
            cascadeFadeUp + cascadeTransition). */}
        <motion.section
          {...cascadeFadeUp}
          transition={cascadeTransition(0)}
          className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-5"
        >
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("promptLabel")}
          </p>
          <p
            className={`${serif.className} mt-1.5 text-[20px] italic font-medium tracking-[-0.01em]`}
          >
            {t("anchorPhrase")}
          </p>
        </motion.section>

        {/* ===== CENTERED LAYOUT =====
            Vertical stack instead of the asymmetric two-pane:
              - Reader pane (centered, full-width, max-w-[720px] body)
              - Compact horizon mark + voice signature
              - Horizontal entries strip below the horizon
            The whole page reads on one vertical axis from top header
            down to the entries archive. */}
        <main className="flex min-h-0 flex-1 flex-col">
          {/* ───── Reader pane (centered full-width, STATIC height) ─────
              No sidebar. The reader takes the full horizontal width of
              the page but constrains its inner content column to
              max-w-[720px] so body text reads at ~65–80 characters per
              line. The actions row, static header, and bounded body
              all use the same centered max-w container so they share
              the same vertical axis.

              Section has an EXPLICIT VIEWPORT-RELATIVE height (48vh)
              so its outer dimensions never change WITHIN a given
              viewport but the design adapts across viewports:
                - 1920×1080 (most common, ~24% of users) → 518px,
                  body shows ~10 lines.
                - 1366×768 (second most common, ~12% of users) →
                  369px, body shows ~7 lines.
                - 2560×1440 (QHD displays) → 691px, body shows
                  ~14 lines.
              Same locked-height guarantee on any given viewport — the
              horizon and entries strip never jump when selecting a
              different entry — but smaller laptops get a compact view
              that fits, and larger displays get a spacious one. The
              body container inside is flex-1 min-h-0, so it absorbs
              whatever space remains after the actions row + static
              header; longer titles just leave less reading space and
              the body scrolls earlier. */}
          {/* Wrapped in cascade motion.section so the reader pane fades
              up as the second beat of the page entrance. The inner
              AnimatePresence cross-fades on activeIdx change are
              independent and continue to drive entry-to-entry swaps
              after the page has fully landed — mount cascade + state-
              driven cross-fade are layered cleanly. */}
          <motion.section
            {...cascadeFadeUp}
            transition={cascadeTransition(1)}
            className="flex flex-shrink-0 flex-col items-center px-10 pt-8"
            style={{ height: "48vh" }}
          >
            {/* Actions row — mode-aware.
                Reading: Edit (when within 6-hour window) · Delete · ···
                Composing / Editing: Save · Cancel
                Right-justified within the centered max-w-[720px]
                column so the buttons align with the static header. */}
            <div className="flex w-full max-w-[720px] flex-shrink-0 justify-end gap-6">
              {mode === "reading" ? (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleEdit}
                      style={{ outline: "none", outlineOffset: 0 }}
                      className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold-bright)]`}
                    >
                      {t("editEntry")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{ outline: "none", outlineOffset: 0 }}
                    className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] hover:text-[var(--sh-text-primary)]`}
                  >
                    {t("delete")}
                  </button>
                  <button
                    type="button"
                    aria-label="More actions"
                    style={{ outline: "none", outlineOffset: 0 }}
                    className={`${sans.className} text-[11px] font-semibold text-[var(--sh-text-tertiary)] hover:text-[var(--sh-text-primary)]`}
                  >
                    ···
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || draftContent.trim().length === 0}
                    style={{ outline: "none", outlineOffset: 0 }}
                    className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
                  >
                    {saving
                      ? t("saving")
                      : mode === "editing"
                        ? t("saveEdit")
                        : t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={saving}
                    style={{ outline: "none", outlineOffset: 0 }}
                    className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)] disabled:opacity-50`}
                  >
                    {t("cancel")}
                  </button>
                </>
              )}
            </div>

            {/*
             * Reader cross-fade — asymmetric exit vs enter timing.
             *
             * Exit (0.7s, EASE.settle): the previous entry departs
             * with the same rhythm it had before — a decisive page-
             * turning fade-out.
             *
             * Enter (1.5s, easeOutSine): the new entry arrives more
             * slowly and more gently. EASE.settle's ease-out-expo
             * curve resolves ~22% of the way through the duration —
             * fast enough that the appearance reads as abrupt. Swapping
             * to a sine-based ease ([0.25, 0.46, 0.45, 0.94]) spreads
             * the deceleration evenly across the full duration, so
             * the content settles into place rather than landing on it.
             *
             * The motion.div lives INSIDE the scrollable body container.
             * Scroll position is managed by the parent div so swapping
             * entries resets scroll to top naturally (key change on the
             * outer container would also work; here the body lives at
             * scrollTop=0 each render because the scrollable container
             * gets a fresh child on every entry swap).
             */}
            {/* ───── STATIC HEADER (date + meta + title) ─────
                Sits above the scrollable body so members never lose
                context of which entry they're reading when scrolling
                long content. Wrapped in its OWN AnimatePresence so
                the date/mood/title still cross-fade when activeIdx
                changes — same key, same duration, same ease as the
                body's AnimatePresence below, so they swap in sync. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`header-${activeIdx}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: {
                    duration: 1.5,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  },
                }}
                exit={{
                  opacity: 0,
                  y: -3,
                  transition: { duration: 0.7, ease: EASE.settle },
                }}
                className="flex w-full max-w-[720px] flex-shrink-0 flex-col"
              >
                {/* Today / date stamp — big italic serif.
                    Sunlit gets a 44px size bump (vs dusk's 36px) so
                    the literary display works the typography drama
                    cream affords. Dusk doesn't need the bump — the
                    luminous contrast on near-black does the lifting. */}
                <p
                  className={`${serif.className} mt-6 italic tracking-[-0.01em] text-[var(--sh-text-tertiary)] ${
                    theme === "sunlit" ? "text-[44px]" : "text-[36px]"
                  }`}
                >
                  {(() => {
                    const stamp = formatEntryDate(
                      reader.created_at,
                      locale,
                      tDate,
                    );
                    // Big-italic date display swaps the uppercase
                    // sentinels (TODAY/YESTERDAY in EN, HOY/AYER in ES)
                    // for their titlecase display variants. Any other
                    // date (e.g. "SAT 13 JUN") renders as-is.
                    if (stamp === tDate("today")) return tDate("todayDisplay");
                    if (stamp === tDate("yesterday")) return tDate("yesterdayDisplay");
                    return stamp;
                  })()}
                </p>

                {/* Meta row — mode-aware.
                    Reading: mood dot/label + time + optional edited
                    badge, all static.
                    Composing / editing: mood becomes an inline picker
                    (small chips, click to select) and the time is
                    omitted because the member is still writing. */}
                {mode === "reading" ? (
                  <div className="mt-1 flex items-center gap-2">
                    {reader.mood && (
                      <>
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: moodDotFor(reader.mood),
                          }}
                        />
                        <span
                          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.28em]`}
                          style={{
                            color: moodLabelFor(reader.mood, theme),
                          }}
                        >
                          {tMood(reader.mood)}
                        </span>
                        <span className="text-[var(--sh-text-muted)]">·</span>
                      </>
                    )}
                    <span
                      className={`${sans.className} text-[11px] text-[var(--sh-text-muted)]`}
                    >
                      {formatEntryTime(reader.created_at, locale)}
                    </span>
                    {reader.edited_at && (
                      <>
                        <span className="text-[var(--sh-text-muted)]">·</span>
                        <span
                          className={`${sans.className} text-[11px] italic text-[var(--sh-text-muted)]`}
                        >
                          {t("edited")}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    {[
                      "grounded",
                      "confused",
                      "angry",
                      "sad",
                      "hopeful",
                      "strong",
                      "scared",
                      "numb",
                    ].map((m) => {
                      const isSelected = draftMood === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setDraftMood(isSelected ? null : m)
                          }
                          style={{ outline: "none", outlineOffset: 0 }}
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
                            isSelected
                              ? "bg-[rgba(196,147,78,0.08)]"
                              : theme === "sunlit" ? "hover:bg-[var(--sh-bg-card-tinted-hover)]" : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: moodDotFor(m) }}
                          />
                          <span
                            className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.22em]`}
                            style={{
                              color: isSelected
                                ? moodLabelFor(m, theme)
                                : "var(--sh-text-tertiary)",
                            }}
                          >
                            {tMood(m)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Title — mode-aware.
                    Reading: static h1 with letterpress depression on
                    sunlit (subtle text-shadow makes the title read as
                    pressed INTO the page). Title is nullable in the DB;
                    untitled entries get the localized "Untitled"
                    fallback.
                    Composing / editing: an unstyled input that looks
                    identical to the h1 — same font, size, weight,
                    tracking, letterpress shadow on sunlit. Transparent
                    background, no border. The reader and the writer
                    share one visual language. */}
                {mode === "reading" ? (
                  (() => {
                    // Reading-mode h1 size scales with title length so
                    // a long prompt-derived title doesn't crash off the
                    // edge of the 720px column. Short freeform titles
                    // still get the full 44px display weight.
                    const displayTitle =
                      reader.title?.trim() || t("untitled");
                    const typo = titleTypography(displayTitle);
                    return (
                      <h1
                        className={`${serif.className} mt-6 font-medium tracking-[-0.015em]`}
                        style={{
                          fontSize: typo.fontSize,
                          lineHeight: typo.lineHeight,
                          ...(theme === "sunlit"
                            ? {
                                textShadow:
                                  "0 1px 0 rgba(255,248,235,0.55), 0 -0.5px 0 rgba(60,40,15,0.08)",
                              }
                            : {}),
                        }}
                      >
                        {displayTitle}
                      </h1>
                    );
                  })()
                ) : (
                  <>
                    {/* SH-73 — Story Series prompt header.
                        Only renders when this compose session was
                        primed by a "Write this story" handoff from
                        the dashboard. Italic serif, smaller than the
                        title, gold-tertiary so it reads as a held
                        question rather than chrome. Persistent — the
                        man is writing TO this question, not from a
                        blank page. */}
                    {mode === "composing" && activeStoryInvitation && (
                      <div className="mt-6 flex flex-col gap-1">
                        <p
                          className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
                        >
                          {t("storyHeader")}
                        </p>
                        <p
                          className={`${serif.className} text-[16px] italic leading-[1.4] text-[var(--sh-text-tertiary)] md:text-[18px]`}
                        >
                          {activeStoryInvitation.promptText}
                        </p>
                      </div>
                    )}
                    {(() => {
                      // Adaptive sizing scales down for long titles,
                      // but a single-line input forces horizontal scroll
                      // once even the smallest tier overflows the
                      // column. A textarea wraps naturally — so a
                      // 60-char prompt title becomes two lines instead
                      // of clipping. The body container below absorbs
                      // the height shift via `flex-1 min-h-0`, so
                      // adding a title line just pushes the writing
                      // surface down by one line. Enter is suppressed
                      // — the title is conceptually single-string,
                      // wrapping for fit, not for newlines.
                      //
                      // Two complementary sizing strategies:
                      //   1. `field-sizing: content` — modern CSS that
                      //      makes the textarea grow with its content
                      //      automatically. Works in Chrome 123+,
                      //      Safari 17.4+, Firefox 121+ (all GA by
                      //      mid-2024). This is the primary mechanism.
                      //   2. useLayoutEffect scrollHeight pattern (on
                      //      titleTextareaRef) — fallback for any
                      //      browser that doesn't support field-sizing
                      //      yet. Sets height to scrollHeight after
                      //      every draftTitle change.
                      //
                      // `overflow-y-hidden` (NOT `overflow-hidden`) so
                      // horizontal overflow can never scroll, but
                      // vertical content is never clipped — wrapping
                      // is the whole point.
                      //
                      // `maxWidth: 100%` enforces the column constraint
                      // explicitly so the textarea can never grow wider
                      // than its parent's max-w-[720px] regardless of
                      // any inherited UA min-width on textarea.
                      const typo = titleTypography(draftTitle);
                      return (
                        <textarea
                          ref={titleTextareaRef}
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                            }
                          }}
                          placeholder={t("titlePlaceholder")}
                          autoFocus
                          rows={1}
                          className={`${serif.className} ${
                            mode === "composing" && activeStoryInvitation
                              ? "mt-3"
                              : "mt-6"
                          } block w-full resize-none overflow-x-hidden bg-transparent font-medium tracking-[-0.015em] text-[var(--sh-text-primary)] placeholder:font-normal placeholder:italic placeholder:text-[var(--sh-text-muted)]`}
                          style={{
                            outline: "none",
                            outlineOffset: 0,
                            fontSize: typo.fontSize,
                            lineHeight: typo.lineHeight,
                            maxWidth: "100%",
                            // Modern CSS textarea auto-grow. Cast
                            // through Record<string,string> because the
                            // React 19 CSS types don't include
                            // `fieldSizing` yet.
                            ...({ fieldSizing: "content" } as Record<
                              string,
                              string
                            >),
                            ...(theme === "sunlit"
                              ? {
                                  textShadow:
                                    "0 1px 0 rgba(255,248,235,0.55), 0 -0.5px 0 rgba(60,40,15,0.08)",
                                }
                              : {}),
                          }}
                        />
                      );
                    })()}
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            {/* ───── SCROLLABLE BODY ─────
                Only the paragraphs scroll. The date/mood/title above
                stays anchored at the top of the reader pane so members
                always see what entry they're reading. */}
            <div
              className="w-full max-w-[720px] flex-1 overflow-y-auto pr-2 min-h-0"
              style={{
                // Body fills whatever vertical space remains inside
                // the section after the actions row + static header.
                // The section itself is locked at 520px (see parent),
                // so the body's effective height ranges from ~290px
                // (with a 2-line title) to ~340px (with a 1-line title).
                // Content past that scrolls within this zone; the
                // horizon and entries strip below never move.

                // Hide the scrollbar — the harbor doesn't show its
                // machinery. Body can still be scrolled with wheel /
                // trackpad / keyboard / drag-touch. If accessibility
                // testing later asks for a visible scrollbar, switch
                // to a slim themed one rather than reverting to default.
                scrollbarWidth: "none",

                // Words going into the horizon — mask-image makes the
                // bottom of the scroll container literally transparent
                // (the TEXT itself fades to alpha-0, not a gradient
                // overlay of bg-color). This works correctly on both
                // sunlit and dusk because we're not matching cream or
                // near-black — we're just dropping the text's own
                // opacity as it approaches the engraved horizon below.
                //
                // The previous bg-color gradient destroyed sunlit
                // readability (gray-on-cream loses contrast fast when
                // you fade gray TOWARD cream). A mask sidesteps that
                // entirely: text simply becomes transparent, the warm
                // gradient + paper grain show through. On dusk the
                // same fade reveals the near-black bg, reading as
                // text dissolving into shadow. Same code, both modes.
                //
                // Curve: solid opaque for the top 70%, then a soft
                // multi-stop fade through the bottom 30% so words don't
                // pop out of existence — they recede into the horizon.
                // The vendor-prefixed copy keeps WebKit happy.
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.85) 82%, rgba(0,0,0,0.45) 92%, transparent 100%)",
                maskImage:
                  "linear-gradient(to bottom, black 0%, black 70%, rgba(0,0,0,0.85) 82%, rgba(0,0,0,0.45) 92%, transparent 100%)",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`body-${activeIdx}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: {
                      duration: 1.5,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    },
                  }}
                  exit={{
                    opacity: 0,
                    y: -3,
                    transition: { duration: 0.7, ease: EASE.settle },
                  }}
                  className="flex flex-col"
                >
                  {/* Body — mode-aware.
                      Reading: static paragraphs split from `content`
                      on double-newline boundaries. Generous bottom
                      padding (pb-16) so the last paragraph clears the
                      mask-fade.
                      Composing / editing: a borderless textarea that
                      visually matches the reading paragraphs — same
                      serif italic, same 18px size, same 1.65 leading.
                      Writing and reading rhyme typographically. */}
                  {mode === "reading" ? (
                    <div className="mt-7 flex flex-col gap-6 pb-16">
                      {bodyParagraphs(reader.content).map((p, i) => (
                        <p
                          key={i}
                          className={`${serif.className} text-[18px] italic leading-[1.65] text-[var(--sh-text-secondary)]`}
                          style={{ whiteSpace: "pre-line" }}
                        >
                          {p}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder={t("reflectionPlaceholder")}
                      rows={12}
                      className={`${serif.className} mt-7 min-h-[260px] w-full resize-none bg-transparent text-[18px] italic leading-[1.65] text-[var(--sh-text-secondary)] placeholder:text-[var(--sh-text-muted)]`}
                      style={{ outline: "none", outlineOffset: 0 }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

          </motion.section>

          {/* ───── Compact horizon — section close ─────
              Same horizon mark (engraved rule + breathing anchor +
              patience line) as the original layout, but tighter:
              no tall void above, no minHeight. Sits as a flex-shrink-0
              divider between the writing zone and the entries archive
              below. Functions both as the writing's editorial close AND
              as the visual boundary between "now" and "before."
              Wrapped in cascade motion.div (step 2) so it joins the
              page-mount choreography between the reader pane and the
              entries strip. */}
          <motion.div
            {...cascadeFadeUp}
            transition={cascadeTransition(2)}
          >
            <CenteredHorizonMark />
          </motion.div>

          {/* ───── Entries strip — horizontal archive ─────
              The "Your Entries" eyebrow on the left + "+ New entry" link
              on the right, with a horizontal row of 7 compact entry
              cards below. Mirrors the sidebar's content but laid out
              horizontally so the page reads on a single vertical axis.

              On viewports narrower than ~1280px the cards may overflow
              horizontally — overflow-x-auto enables drag-scroll there.
              On wider viewports all 7 cards fit comfortably.
              Wrapped in cascade motion.section (step 3) — the last
              beat of the journal entrance, landing after the horizon
              mark. */}
          <motion.section
            {...cascadeFadeUp}
            transition={cascadeTransition(3)}
            className="flex flex-shrink-0 flex-col items-center border-t border-[var(--sh-border-subtle)] px-10 pb-4 pt-3"
          >
            <div className="mb-2 flex w-full max-w-[1200px] items-center justify-between">
              <p
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
              >
                {t("entriesEyebrow")}
              </p>
              {/* "All entries →" — opens the archive surface where every
                  past entry lives, grouped by month. The "+ New entry"
                  text link that used to live here was redundant with the
                  new NewEntryStripCard tile in the row below; replacing
                  it with the archive affordance solves the discoverability
                  gap created when we capped the strip at 6 past entries
                  to make room for the New Entry tile.

                  Disabled (visual + click) during compose/edit because
                  navigating away would drop the in-progress draft. The
                  member must Save or Cancel first. */}
              <button
                type="button"
                onClick={() => router.push("/journal/archive")}
                disabled={mode !== "reading"}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-40`}
              >
                {t("allEntries")} →
              </button>
            </div>

            {/* ───── Entries row ─────
                Renders `stripEntries`, which is the real entries list
                EXCEPT when composing — in that case a synthetic draft
                entry (id: "__draft__") is prepended and shows the live
                mirror of whatever the member is typing. The strip's
                leftmost card fills in as the title and mood change.
                Active card gets the engraved-gold lens hairlines and
                (on sunlit) a warm-tint bg. */}
            <div
              className="flex w-full max-w-[1200px] justify-center gap-3 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
              // Single mouse-leave on the container (not per-card) clears
              // hoveredStripIdx the moment the cursor exits the strip
              // entirely. This is the dashboard RoomsCarousel pattern:
              // one listener at the container level avoids the gaps
              // between cards getting interpreted as "no hover."
              onMouseLeave={() => setHoveredStripIdx(null)}
            >
              {/* ───── "+ New entry" tile ─────
                  The "manual" entry affordance — a card the member
                  clicks to start writing. Visually parallels the past-
                  entry tiles (same 160×94, same padding rhythm) so the
                  whole strip reads as one row of clickable surfaces,
                  matching the dashboard rooms carousel where every tile
                  is an action.

                  Only renders in reading mode. In composing or editing
                  mode, the draft card already occupies the leftmost
                  slot — surfacing "new entry" while the member is
                  already writing one would be visual noise.

                  Sentinel hover index: -1. Falls outside the 0..N range
                  of real entries so highlightedStripIdx can distinguish
                  it cleanly from past-entry hover. */}
              {mode === "reading" && (
                <button
                  type="button"
                  onClick={handleNewEntry}
                  onMouseEnter={() => setHoveredStripIdx(-1)}
                  style={{ outline: "none", outlineOffset: 0 }}
                  className="flex-shrink-0 text-left transition-colors"
                >
                  <NewEntryStripCard
                    active={highlightedStripIdx === -1}
                    theme={theme}
                    label={t("newEntry")}
                  />
                </button>
              )}

              {stripEntries.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    // Switching to a different entry while composing
                    // or editing would lose the draft. Block strip
                    // clicks in those modes; the member must Save or
                    // Cancel first to break out.
                    if (mode !== "reading") return;
                    setActiveIdx(i);
                  }}
                  onMouseEnter={() => setHoveredStripIdx(i)}
                  style={{ outline: "none", outlineOffset: 0 }}
                  className="flex-shrink-0 text-left transition-colors"
                >
                  <EntryStripCard
                    entry={e}
                    active={i === highlightedStripIdx}
                    theme={theme}
                    untitledLabel={t("untitled")}
                    moodTranslator={tMood}
                  />
                </button>
              ))}
            </div>
          </motion.section>
        </main>
      </div>
    </div>

    {/* Unsaved-changes guard — intercepts ALL in-app link clicks (Stone
        Harbor breadcrumb, mobile tab bar, anywhere a Link is) when the
        member has typed something in compose or edit mode. The hook
        layers in tab close / refresh / external nav via beforeunload
        too. Modal stays mounted but only renders when journalDirty
        triggers a click interception (see useUnsavedChangesWarning). */}
    <UnsavedChangesModal
      open={journalUnsaved.showModal}
      onStay={journalUnsaved.cancelNavigation}
      onLeave={journalUnsaved.confirmNavigation}
      bodyLabel="your journal entry"
    />
    </>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * Compact horizon mark for the centered layout.
 *
 * Same engraved-gold rule + breathing anchor + voice signature as the
 * original /journal layout's bottom banner, but tighter: no tall void
 * above it, no minHeight floor, just the rule + anchor + line packed
 * close together. Sits between the writing zone and the entries archive
 * as a literal section close.
 *
 * Theme-aware optical metaphor matches the original (luminous on dusk,
 * engraved on sunlit). The outer wrap pulses opacity only; a nested
 * motion.div scales the anchor so the wide rule itself stays still.
 */
function CenteredHorizonMark() {
  const { theme } = useTheme();
  const t = useTranslations("journal");
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center pb-3 pt-4">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <HorizonSegment
          direction="left"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
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
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
      <p
        className={`${serif.className} mt-3 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {t("voiceSignature")}
      </p>
    </div>
  );
}

// HorizonSegment moved to `app/components/horizonSegment.tsx` as part
// of the 2026-06-18 sweep to convert every harbor hairline to CSS.
// The local SVG asymmetric-lens implementation pixelated on wider
// viewports — same root cause as the HairlineLens issue. Imported
// at the top of this file.

/**
 * Compact entry card for the horizontal strip below the horizon.
 *
 * Smaller than the EntryCard used in the sidebar layout — fixed
 * 160px wide × ~90px tall so 7 fit comfortably across a 1200px
 * container. Shows date stamp + mood dot at top, title in the middle,
 * tiny mood label at the bottom. Active state renders the same
 * engraved-gold lens hairlines (top + bottom) the sidebar uses, so
 * selection feels visually consistent across both layouts.
 */
function EntryStripCard({
  entry,
  active,
  theme,
  untitledLabel,
  moodTranslator,
}: {
  entry: DBEntry;
  active: boolean;
  theme: "sunlit" | "dusk";
  untitledLabel: string;
  moodTranslator: (key: string) => string;
}) {
  // Locale + date-label translator drive the strip pill so /es renders
  // "AYER" / "SÁB 13 JUN" instead of the pre-2026-06-19 English-only
  // "YESTERDAY" / "SAT 13 JUN". The strip card is its own React
  // component so we can call the hooks directly here rather than
  // threading locale through every prop.
  const locale = useLocale();
  const tDate = useTranslations("journal.dateLabel");
  const titleText = entry.title?.trim() || untitledLabel;

  return (
    // Active-state visual treatment ported from dashboard RoomCard
    // (the rooms-carousel "farol" pattern): a radial-gradient beam of
    // light falling from top-center, paired with a single top
    // HairlineLens (the "lintel"). Replaces the previous flat gold-
    // tint bg + top-and-bottom hairline frame so the journal entries
    // strip and the dashboard rooms strip speak in one visual
    // language. The bottom hairline (which previously read as a
    // contained-moment frame) is removed in favor of the lintel-only
    // reading, matching the dashboard's door semantic.
    //
    // Cursor-follow behavior is identical on both surfaces (driven by
    // `highlightedStripIdx = hoveredStripIdx ?? activeIdx` at the
    // parent level), so the only difference between this strip and
    // dashboard rooms is the card content — the lighting language is
    // shared.
    <div
      className="relative flex flex-col gap-1 px-3 py-2.5 transition-[background] duration-300"
      style={
        active
          ? {
              width: "160px",
              height: "94px",
              background:
                "radial-gradient(ellipse 50% 140% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.015) 55%, transparent 95%)",
            }
          : { width: "160px", height: "94px" }
      }
    >
      {/* Engraved-gold hairline — top only. Always mounted, opacity-
          toggled so the highlight fades from card to card on cursor-
          follow rather than popping. Matches dashboard RoomCard. */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        <HairlineLens position="top" theme={theme} />
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: moodDotFor(entry.mood) }}
        />
        {/* SH-73 — quiet gold dot when this entry answered a Story
            Series prompt. Sits inline after the mood dot so the man
            can see the source of an entry at a glance without us
            shouting it. Engraved gold (#a9793d) reads on both themes
            and matches the strip's hairline color. */}
        {entry.story_invitation_id && (
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#a9793d" }}
            title="A story to tell"
          />
        )}
        <span
          className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]`}
        >
          {formatEntryDate(entry.created_at, locale, tDate)}
        </span>
      </div>
      <p
        className={`${serif.className} mt-0.5 line-clamp-2 text-[13px] font-medium leading-[1.2] tracking-[-0.005em] text-[var(--sh-text-primary)]`}
      >
        {titleText}
      </p>
      {entry.mood && (
        <span
          className={`${sans.className} mt-auto text-[8px] font-semibold uppercase tracking-[0.26em]`}
          style={{ color: moodLabelFor(entry.mood, theme) }}
        >
          {moodTranslator(entry.mood)}
        </span>
      )}
    </div>
  );
}

/**
 * "+ New entry" tile for the entries strip.
 *
 * The manual-action affordance: visually parallels EntryStripCard
 * (160×94, same active/hover background rhythm, same engraved-gold
 * lens hairlines) so the strip reads as one row of clickable tiles
 * rather than "past entries + a small button." Mirrors the dashboard
 * rooms carousel where every card is an action.
 *
 * Renders gold "+" + uppercase "New entry" label, both in the gold
 * accent color so the tile reads as an affordance from across the
 * page. Active state (hover) lights up the lens hairlines on top and
 * bottom edges, identical to a hovered past entry — the strip's tiles
 * speak in one visual language.
 *
 * Only shown in reading mode (see the JSX above). In composing or
 * editing modes the draft card occupies the leftmost slot and this
 * card hides.
 */
function NewEntryStripCard({
  active,
  theme,
  label,
}: {
  active: boolean;
  theme: "sunlit" | "dusk";
  /** Localized "New entry" string from useTranslations("journal"). */
  label: string;
}) {
  return (
    // Same farol + top-only-hairline treatment as EntryStripCard
    // above so the entire strip — new-entry tile + past entries —
    // reads as one row of doors in shared lighting. See the comment
    // block on EntryStripCard for the rationale around the visual
    // language unification with dashboard rooms.
    <div
      className="relative flex flex-col items-center justify-center gap-1 px-3 py-2.5 transition-[background] duration-300"
      style={
        active
          ? {
              width: "160px",
              height: "94px",
              background:
                "radial-gradient(ellipse 50% 140% at 50% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.015) 55%, transparent 95%)",
            }
          : { width: "160px", height: "94px" }
      }
    >
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        <HairlineLens position="top" theme={theme} />
      </div>
      <span
        className={`${serif.className} text-[26px] italic leading-none text-[var(--sh-accent-gold)]`}
      >
        +
      </span>
      <span
        className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
      >
        {label}
      </span>
    </div>
  );
}

// HairlineLens moved to `app/components/hairlineLens.tsx` as part of
// the 2026-06-18 sweep to convert every harbor hairline to CSS.
// The local SVG lens implementation pixelated on taller cards (the
// /messages issue); the CSS gradient bar is crisp at any size. Imported
// at the top of this file.

/**
 * EntryTailpiece — the small fleuron at the end of each entry's body.
 *
 * Marks completion of a journal entry the way an editorial tailpiece
 * marks the end of a printed article — but in Stone Harbor's vocabulary
 * instead of Victorian curlicues. The Stone Harbor anchor is the
 * central element; two gradient hairlines (160px each) flank it.
 *
 * The hairlines fade AWAY from the anchor (opaque at the inner end,
 * transparent at the outer end) — opposite of the active-entry lens
 * hairlines which are opaque in the middle. That outward fade
 * reinforces "the entry is finished; nothing more follows."
 *
 * The whole tailpiece BREATHES on a 4-second cycle — same rhythm
 * members practice on /meditation. The breath is load-bearing here:
 * marks the held moment of an entry having been sat with. The previous
 * global footer breathing anchor's pattern can move here (instead of
 * being decorative chrome at the bottom). One breath, in the right
 * place: where the writing was held.
 *
 * Voice rule: never use this as decoration only. The tailpiece appears
 * after a journal entry's body because the entry has ended. If the
 * member is still writing, no tailpiece appears.
 */
function EntryTailpiece() {
  // Theme drives the fleuron's optical metaphor (luminous vs. engraved),
  // not its silhouette or rhythm. The breathing animation, the two-line
  // + anchor composition, the centering — all theme-invariant. What
  // swaps is gold color, alpha shape, and shadow direction.
  const { theme } = useTheme();
  const t = useTranslations("journal");

  // Gold core: deeper on sunlit (so it reads on cream without a halo),
  // brighter on dusk (so the halo can lift it off near-black).
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";

  // Shadow model:
  //   sunlit → 1px-offset dark ink impression (letterpress)
  //   dusk   → soft outward gold glow (luminous)
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";

  // Alpha curve on the gradient. Engraved sunlit deserves a stronger
  // mid-line to read as a confident stroke; luminous dusk benefits from
  // a slightly softer mid so the glow does the lifting.
  //
  // Bumped sunlit inner 0.92 → 0.95 so the flanking lines sit with
  // the wider engraved rule above more confidently — the sister
  // elements needed to read at matching weight, not slightly quieter.
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.45 : 0.35;

  return (
    /*
     * Static-size banner — NOT sticky and NOT scrolled.
     *
     * Lives as a flex-shrink-0 sibling below the scrollable body
     * container in the reader section. The reader section is itself
     * a flex column, so this banner occupies a fixed slice of the
     * bottom of the section while body text scrolls above it.
     *
     * Two reasons why this beats the earlier sticky approach:
     *   1. Body text PHYSICALLY cannot appear below the banner — the
     *      scrollable container ends at the banner's top edge.
     *   2. No framer-motion transform interferes with positioning
     *      because the banner is a sibling of the AnimatePresence
     *      container, not a descendant.
     *
     * Composition (post-consolidation):
     *   - The horizon mark (engraved rule + centered anchor) sits
     *     vertically centered in the banner. It breathes on a 4-second
     *     opacity + tiny-scale cycle.
     *   - "The harbor is patient." sits just below the horizon mark
     *     as the voice signature — static, the breath belongs to the
     *     mark.
     *   - The void ABOVE the horizon mark (between body-text-end and
     *     the rule) is the held moment. Cream + grain + warmth fill
     *     it; no decorative dressing.
     *
     * The banner extends visually to the bottom of the reader pane,
     * meeting the global crisis footer with no gap. From the member's
     * perspective, the entry closes with a held breath at the harbor
     * on the horizon, and then — only after that breath — the 988
     * band appears.
     */
    <div
      // Transparent banner (no bg-page) so the body's warm gradient +
      // paper grain show through here too. The scrollable body
      // container ABOVE this banner is overflow-y-auto with min-h-0,
      // which means body text physically cannot extend past the
      // banner's top edge — so we don't need an opaque shield down
      // here to mask scrolling text. The static-size architecture
      // makes the old "opaque banner over text" model unnecessary.
      //
      // Top-aligned composition (was vertically centered):
      //   The horizon rule used to sit centered in the banner, which
      //   put ~120px of void ABOVE it before any body text reached
      //   it. That void broke the "words dissolving into the horizon"
      //   reading because the mask-image fade ended at the banner's
      //   top edge and then there was a long gap before the rule
      //   itself. Eye couldn't connect the dissolve to the horizon.
      //
      //   With justify-start + a small pt-4, the rule now sits ~16px
      //   below the banner's top edge — right where the mask fade
      //   bottoms out. Body text approaching the horizon fades in
      //   its final line and the rule appears immediately. The
      //   dissolve and the horizon are visually coupled.
      //
      //   The patience line sits tight under the rule (mt-5); the
      //   remaining banner space becomes void BELOW the composition,
      //   filled with the body's warm gradient + grain. That tail
      //   void is the held silence after the harbor speaks.
      className="relative flex flex-shrink-0 flex-col items-center justify-start pt-4 pb-14"
      style={{ minHeight: "220px" }}
    >
      {/* Horizon mark — the full-width engraved rule kept at its
          original 640px max-width, with the Stone Harbor anchor
          interrupting it at center. The wide rule IS the horizon;
          the anchor is the fixed point on it. Body text scrolling up
          from above approaches this horizon and dissolves into it —
          the words go into the horizon, the harbor remains.

          Composition notes:
            - Container is w-3/4 max-w-[640px], matching the original
              standalone rule's full width. The rule extends well past
              the anchor on both sides so the eye reads "horizon," not
              "fleuron." This is the difference between an editorial
              section break (wide) and a decorative tailpiece (narrow).
            - Each side uses flex-1 so the segments auto-fill the
              available space. On any viewport width, the anchor stays
              precisely at center and the rule stretches to both edges
              of the max-width container.
            - Anchor at size 20 (vs the previous 18 fleuron anchor) so
              it carries authority at horizon scale without dominating
              the rule it sits on.

          Breathing — two-layer animation:
            - Outer wrap pulses opacity 0.78 → 1 on the WHOLE composition
              (rule + anchor). The lines themselves never shift
              horizontally — they only gently brighten and dim, like
              the horizon catching morning vs. afternoon light.
            - Inner wrap on the anchor ALSO scales 1 → 1.04 in sync.
              Only the anchor visibly swells; the rule stays still. The
              harbor breathes against the unchanging horizon.

          This separation is intentional: scaling a 640px-wide rule by
          1.04 would shift the ends ~13px each way — visible drift
          that breaks the horizon's stillness. Localizing the scale to
          just the anchor preserves the wide-rule horizon AND keeps the
          fleuron-style anchor breath we loved before. */}
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            // Left rule segment — fully transparent at the outer edge,
            // strengthening through midAlpha to its strongest at the
            // anchor side. The horizon dissolves at the far end (no
            // hard line crashing into the reader pane's edge) and lands
            // decisively at the harbor.
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />
        {/* Anchor — the fixed point on the horizon, breathing in place.
            shaftHeight 42 (vs default 38) gives the rod more vertical
            authority at horizon scale. Fill swaps gold-deep on sunlit /
            gold-bright on dusk so the anchor matches the surrounding
            rule. */}
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
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            // Right rule segment — mirror of the left: confident at the
            // anchor, tapering out to transparent at the far edge.
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>

      {/* The harbor's quiet response. Static — the fleuron breathes,
          the voice is steady.

          Color stepped from text-muted to text-tertiary (June 2026
          sunlit pass): on sunlit cream, text-muted (#a8a29e) was almost
          invisible — the voice signature failed to land. text-tertiary
          (#78716c sunlit / #a8a29e dusk) reads quietly on both themes
          without becoming chatty. */}
      <p
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {t("voiceSignature")}
      </p>
    </div>
  );
}

function EntryCard({
  entry,
  active,
  theme,
  untitledLabel,
  moodTranslator,
}: {
  entry: DBEntry;
  active: boolean;
  theme: "sunlit" | "dusk";
  /** Localized "Untitled" string for entries with null title. */
  untitledLabel: string;
  /** Translator from useTranslations("mood"), keyed by lowercase mood. */
  moodTranslator: (key: string) => string;
}) {
  // Locale + date-label translator for the dateStamp below — see
  // EntryStripCard for the same pattern. EntryCard is the larger
  // sidebar variant; the strip card is the compact horizontal one.
  const locale = useLocale();
  const tDate = useTranslations("journal.dateLabel");
  // Active-state background:
  //   - sunlit → warm gold-tinted cream ~4% alpha, suggests the page
  //     got slightly more sun in this spot. The lens hairlines alone
  //     don't carry enough spotlight-presence on cream; pairing them
  //     with a gentle warm tint lifts the card without competing.
  //   - dusk → no bg tint. The luminous hairlines on near-black
  //     already produce the spotlight reading; adding warmth would
  //     muddy the focused-beam effect.
  // Hover state (inactive only): a faint hover tint that's neutral
  // enough to work in both themes.
  const activeBg =
    active && theme === "sunlit" ? "bg-[rgba(196,147,78,0.045)]" : "";
  const hoverBg = !active ? (theme === "sunlit" ? "hover:bg-[var(--sh-bg-card-tinted-hover)]" : "hover:bg-white/[0.02]") : "";

  const dateStamp = formatEntryDate(entry.created_at, locale, tDate);
  const titleText = entry.title?.trim() || untitledLabel;
  const previewText = previewFor(entry.content);

  return (
    <div
      className={`relative flex flex-col gap-1 px-3.5 py-3 transition-colors ${activeBg} ${hoverBg}`}
      style={{ height: "116px" }}
    >
      {active && (
        <>
          <HairlineLens position="top" theme={theme} />
          <HairlineLens position="bottom" theme={theme} />
        </>
      )}

      <div className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: moodDotFor(entry.mood) }}
        />
        {/* SH-73 — same quiet gold dot as the strip card. Marks
            entries that came from a Story Series prompt. */}
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
          {dateStamp}
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
        className={`${serif.className} truncate text-[14px] font-medium leading-[1.25] tracking-[-0.005em] text-[var(--sh-text-primary)]`}
      >
        {titleText}
      </p>
      <p
        className={`${sans.className} line-clamp-2 text-[10px] leading-[1.5] text-[var(--sh-text-secondary)]`}
      >
        {previewText}
      </p>
    </div>
  );
}
