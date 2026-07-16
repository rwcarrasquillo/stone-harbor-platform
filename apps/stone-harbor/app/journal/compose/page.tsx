"use client";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { AnchorMark } from "@/app/components/anchorMark";
import { supabase } from "@/lib/supabaseClient";
import { emitMemberEvent, trackMilestone } from "@/lib/memberUsage";
import {
  deriveTitleFromPrompt,
  fetchInvitationById,
  fetchPromptById,
  markInvitationAnswered,
  type MemberStoryInvitation,
  type StoryPrompt,
  type StoryTelemetry,
} from "@/lib/story";
import { InactivityGate } from "@/app/components/inactivityGate";
import { serif, sans } from "@/lib/fonts";
import {
  Flame,
  MoodAngry,
  MoodConfused,
  MoodGrounded,
  MoodHopeful,
  MoodSad,
  MoodStrong,
  SoundOff,
  SoundOn,
  Speech,
  type IconProps,
} from "@/app/components/icons";
import { todaysPrompt as sharedTodaysPrompt } from "@/lib/dailyPrompts";
import { useTheme } from "@/app/components/themeProvider";
import { PageAmbience } from "@/app/components/pageAmbience";
import { PageTopNav } from "@/app/components/pageTopNav";
import { VentInput, VentTextarea } from "@/app/components/ventField";
import { UnsavedChangesModal } from "@/app/components/unsavedChangesModal";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { BodyCheck, type BodySpot } from "@/app/components/bodyCheck";
import { SubMoods } from "@/app/components/subMoods";
import { LineageReference } from "@/app/components/lineageReference";
import type { Mood } from "@/lib/moods";
import {
  FEATURE_THRESHOLDS,
  isFeatureUnlocked,
} from "@/lib/userProgress";
import {
  detectLineageThemes,
  resolveLineageReferences,
  type LineageContent,
} from "@/lib/lineageMatcher";
import {
  JOURNAL_EDIT_WINDOW_MS,
  isWithinEditWindow,
} from "@/lib/journalEditWindow";

// Brand system — matches home + dashboard
const GOLD = "#c4934e";
const GOLD_DEEP = "#a9793d";
const MOSS = "#586558";

// Mood taxonomy — its own small color system, separate from brand accents.
// Used for chips, entry-card left borders, and the mood map.
// `label` is the English fallback; the chip/badge/legend each call
// `tMood(option.value)` to render the locale-aware label. Keeping the
// English string here means any code path that doesn't have a
// translator still renders something readable.
const moodOptions = [
  { value: "grounded", label: "Grounded", color: "#586558" },
  { value: "confused", label: "Confused", color: "#9c8a6e" },
  { value: "angry", label: "Angry", color: "#a05a3c" },
  // Sad deepened from #5d6a78 → #3e5670 (2026-05-31). The earlier value
  // sat at nearly identical lightness/saturation to Grounded (#586558),
  // and in the small 30-day strip dots the eye couldn't separate moss-
  // gray from blue-gray. Going deeper rather than brighter is
  // psychologically apt — sadness should read as the heavier emotion.
  { value: "sad", label: "Sad", color: "#3e5670" },
  { value: "hopeful", label: "Hopeful", color: "#c4934e" },
  { value: "strong", label: "Strong", color: "#8d6432" },
] as const;

function moodColor(value: string | null | undefined) {
  if (!value) return "#a9793d";
  return (
    moodOptions.find((o) => o.value === value.toLowerCase())?.color ?? "#a9793d"
  );
}

const moodIcons: Record<string, ComponentType<IconProps>> = {
  grounded: MoodGrounded,
  confused: MoodConfused,
  angry: MoodAngry,
  sad: MoodSad,
  hopeful: MoodHopeful,
  strong: MoodStrong,
};

function moodIconFor(
  value: string | null | undefined,
): ComponentType<IconProps> | null {
  if (!value) return null;
  return moodIcons[value.toLowerCase()] ?? null;
}

/**
 * Resolve a mood value into a localized display label.
 * Accepts the `tMood` (mood namespace) and `tJournal` (journal namespace)
 * translators so it stays a pure function — no hook calls inside.
 * Returns the journal-specific "Reflection" fallback when the value is
 * null/undefined, matching the legacy English behavior.
 */
function moodLabel(
  value: string | null | undefined,
  tMood: (key: string) => string,
  tJournal: (key: string) => string,
): string {
  if (!value) return tJournal("reflectionFallback");
  const found = moodOptions.find((o) => o.value === value.toLowerCase());
  if (!found) return value;
  return tMood(found.value);
}

// Daily writing prompts live in @/lib/dailyPrompts so the dashboard's
// "Tomorrow" preview tile can read from the same source. Add or edit
// prompts there — both surfaces pick them up automatically.
function todaysPrompt() {
  return sharedTodaysPrompt();
}

// ============================================================================
// Mood palette (DESKTOP UI ONLY) — keyed by lowercase DB value, matches the
// /journal reader's MOODS table exactly. Each mood has theme-aware label
// colors so the chip reads correctly on both sunlit cream and dusk near-black.
// ============================================================================
//
// Why separate from `moodOptions` above: the existing moodOptions uses icon
// components and a single `color` field, sized for the mobile mood picker.
// The desktop UI uses small dot+label chips that need a brightened "dusk"
// tint and a deepened "sunlit" tint per mood — same model the reader uses.
// Keeping both tables means mobile + desktop can iterate independently.
//
// TODO: once mobile adopts the theme-aware tints, extract this to a shared
// lib (e.g. lib/moodPalette.ts) so both routes import from one source.
type DesktopMoodTints = {
  dot: string;
  labelDusk: string;
  labelSunlit: string;
};

const DESKTOP_MOODS: Record<string, DesktopMoodTints> = {
  sad:      { dot: "#3e5670", labelDusk: "#95b5d4", labelSunlit: "#3e5670" },
  grounded: { dot: "#586558", labelDusk: "#b0c4b0", labelSunlit: "#4a5648" },
  hopeful:  { dot: "#c4934e", labelDusk: "#e8c896", labelSunlit: "#a9793d" },
  strong:   { dot: "#8d6432", labelDusk: "#d4a974", labelSunlit: "#7a5226" },
  confused: { dot: "#9c8a6e", labelDusk: "#d4c5a9", labelSunlit: "#776654" },
  angry:    { dot: "#a05a3c", labelDusk: "#e8997a", labelSunlit: "#8c4a2e" },
  scared:   { dot: "#7d6ca2", labelDusk: "#bdaedb", labelSunlit: "#5e4d83" },
  numb:     { dot: "#8a8a8a", labelDusk: "#bababa", labelSunlit: "#5e5e5e" },
};

const DESKTOP_MOOD_FALLBACK: DesktopMoodTints = DESKTOP_MOODS.grounded;

function desktopMoodLabelColor(
  mood: string | null,
  theme: "sunlit" | "dusk",
): string {
  const tints = (mood && DESKTOP_MOODS[mood]) || DESKTOP_MOOD_FALLBACK;
  return theme === "sunlit" ? tints.labelSunlit : tints.labelDusk;
}

function desktopMoodDotColor(mood: string | null): string {
  return ((mood && DESKTOP_MOODS[mood]) || DESKTOP_MOOD_FALLBACK).dot;
}

// Sidebar date stamp — matches the reader's formatter so dates display the
// same way across both surfaces. Older entries get "DDD D MMM" (e.g.,
// "FRI 6 JUN"); same-day → "TODAY"; day-prior → "YESTERDAY".
function desktopFormatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfToday) return "TODAY";
  if (date >= startOfYesterday) return "YESTERDAY";
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

/**
 * Returns the catalog KEY for the current time-of-day band. The caller
 * resolves it via `tJournal(`timeGreeting.${key}`)` so the same logic
 * works in any locale.
 */
function timeGreetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return "lateNight";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "tonight";
}

type JournalEntry = {
  id: string;
  title: string | null;
  // original_title is the immutable first-save title (or null if the
  // entry was originally untitled). Never updated server-side after
  // row creation. Mirrors the original_content preservation pattern.
  original_title: string | null;
  content: string;
  // original_content is the immutable first-save text. Equal to content
  // until the member edits within the 6-hour window. Never updated
  // server-side after row creation.
  original_content: string;
  mood: string | null;
  created_at: string;
  // edited_at is null until the member edits an entry. Once edited,
  // it stores the timestamp of the most recent edit. Existence of a
  // value drives the "· edited" UI indicator. Set whenever title OR
  // content changes — they edit together as a unit.
  edited_at: string | null;
};

// JOURNAL_EDIT_WINDOW_MS and isWithinEditWindow live in
// lib/journalEditWindow.ts (imported above) so the same policy is
// shared between the page UI and the vitest unit tests without
// pulling the entire client component into the test environment.

type SortOption = "newest" | "oldest" | "mood" | "title";

function computeStreak(entries: JournalEntry[]) {
  if (entries.length === 0) return 0;
  const dates = new Set(
    entries.map((e) => new Date(e.created_at).toDateString()),
  );
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (dates.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function daysSinceLastEntry(entries: JournalEntry[]) {
  if (entries.length === 0) return null;
  const latest = new Date(entries[0].created_at);
  const today = new Date();
  const diff = Math.floor(
    (today.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diff;
}

function buildMoodMap(
  entries: JournalEntry[],
): { date: Date; mood: string | null }[] {
  const days: { date: Date; mood: string | null }[] = [];
  // Map type widened to string | null so days with a saved entry but no
  // selected mood are honestly represented as "wrote but didn't name a
  // mood" rather than being silently bucketed as "grounded". An earlier
  // version forced null → "grounded" on insert, which inflated the
  // grounded count and misrepresented the member's actual pattern.
  // Rendering treats null moods the same as no-entry days (blank
  // square), which matches the legend copy ("blanks are days you
  // didn't write or didn't name a mood").
  const moodByDate = new Map<string, string | null>();
  // Use the FIRST (most recent) entry per day since they're already sorted desc.
  for (const entry of entries) {
    const key = new Date(entry.created_at).toDateString();
    if (!moodByDate.has(key)) {
      moodByDate.set(key, entry.mood ?? null);
    }
  }
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toDateString();
    days.push({ date: d, mood: moodByDate.get(key) ?? null });
  }
  return days;
}

export default function JournalPage() {
  const { theme } = useTheme();
  const isDusk = theme === "dusk";
  // i18n — three namespaces so chrome (mood chips, time greeting) and
  // page-specific copy each read from the catalog that owns them.
  // Keeping these as separate hooks (vs. one root translator) lets the
  // translator stay strictly typed against the namespace it covers.
  const t = useTranslations("journal");
  const tMood = useTranslations("mood");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Account age drives progressive disclosure of new healing-path features.
  // null until the profile loads; treat as "no features unlocked" while null.
  const [userCreatedAt, setUserCreatedAt] = useState<string | null>(null);
  // Body-check overlay state. `pendingBodySpots` holds the result between
  // overlay-close and journal-entry-save, so the somatic moment can be
  // linked to the entry it preceded.
  const [bodyCheckOpen, setBodyCheckOpen] = useState(false);
  const [pendingBodySpots, setPendingBodySpots] = useState<BodySpot[] | null>(
    null,
  );
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<Mood>("grounded");
  // Fine-grained emotion within the parent mood family. Set by the
  // SubMoods chip row; resets whenever the parent mood changes since
  // a sub-mood like "resentful" doesn't carry across to "hopeful."
  const [moodSpecific, setMoodSpecific] = useState<string | null>(null);
  // Edit-mode state for the 6-hour edit window. editingEntryId points
  // at the entry currently being refined; editingDraft holds the in-
  // progress body text; editingDraftTitle holds the in-progress title.
  // Only one entry is editable at a time — opening edit on a second
  // entry cancels the first. Title and content edit together as a
  // single unit (one Save Edit click commits both).
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingDraftTitle, setEditingDraftTitle] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // When the textarea has been empty AND focused for >12 seconds, we
  // surface a gentle one-line nudge underneath: "Start with one word."
  // This is the 5-second-rule pattern translated to the harbor's voice
  // — no countdown, no animation, just permission to begin badly.
  const [showStartNudge, setShowStartNudge] = useState(false);
  // The member's lineage content, loaded once at profile fetch time.
  // The reference-back matcher uses it to decide which "you wrote
  // about this once" cards to surface after a save.
  const [lineageContent, setLineageContent] = useState<LineageContent>({
    fatherGrief: null,
    fatherAnger: null,
    patternToLeave: null,
  });
  // References surfaced for the most recent save. Cleared when the
  // man starts writing the next entry OR explicitly dismisses each.
  const [pendingReferences, setPendingReferences] = useState<
    ReturnType<typeof resolveLineageReferences>
  >([]);
  const [content, setContent] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // === Story Series context ===
  // Set when /journal is opened via ?invitation_id=X from the dashboard
  // story card. The composer renders the prompt as a quoted header,
  // hides the title input + generic mood picker, swaps in a reflection-
  // mood picker, and on save marks the invitation answered with the
  // engagement telemetry captured during writing.
  const searchParams = useSearchParams();
  const router = useRouter();
  const invitationIdParam = searchParams.get("invitation_id");

  // Desktop save flow — after a successful save from the desktop UI,
  // we want to redirect to /journal so the member sees their new entry
  // in the reader. Mobile users stay on the page (existing behavior).
  // The ref is set when the desktop Save button fires; a useEffect
  // below watches the `saving` flag and redirects once it clears.
  const desktopSavingRef = useRef(false);
  // Form ref so the gold "Save" button at top-right can trigger the
  // form's onSubmit (saveEntry) without being a submit button itself.
  const desktopFormRef = useRef<HTMLFormElement>(null);
  const [storyInvitation, setStoryInvitation] =
    useState<MemberStoryInvitation | null>(null);
  const [storyPrompt, setStoryPrompt] = useState<StoryPrompt | null>(null);
  // The "how does this memory sit with you?" picker is separate from
  // the generic journal mood. It only renders during a Story flow and
  // is persisted into telemetry.reflection_mood + mirrored to
  // journal_entries.mood so the entries list displays the choice.
  // Optional — null means the man chose not to answer.
  const [reflectionMood, setReflectionMood] = useState<
    NonNullable<StoryTelemetry["reflection_mood"]> | null
  >(null);

  // Telemetry refs: tracked imperatively (no re-renders) and snapshotted
  // into a StoryTelemetry object on save.
  const shownAtRef = useRef<number | null>(null);
  const firstKeystrokeAtRef = useRef<number | null>(null);
  const lastKeystrokeAtRef = useRef<number | null>(null);
  const activeMsRef = useRef<number>(0);
  const pausesRef = useRef<number>(0);
  const deletesRef = useRef<number>(0);
  const prevLenRef = useRef<number>(0);

  // Unsaved-changes guard for the journal composer. Dirty whenever
  // the textarea or title contains content that hasn't been saved.
  // Cleared automatically after saveEntry resets content + title to "".
  const journalDirty = content.trim().length > 0 || title.trim().length > 0;
  const journalUnsaved = useUnsavedChangesWarning(journalDirty);
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [breathPhase, setBreathPhase] = useState<"inhale" | "exhale">("inhale");

  // 4s/4s breath pulse — used in the loading state and the daily breath strip.
  useEffect(() => {
    const id = setInterval(() => {
      setBreathPhase((p) => (p === "inhale" ? "exhale" : "inhale"));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // "Start with one word" nudge — surfaces when the man has the
  // journal open but hasn't started typing. 12 seconds is the
  // sweet spot from informal testing: long enough that the line
  // doesn't appear for someone who's clearly mid-thought, short
  // enough to catch the man who is staring at a blank box.
  // Resets whenever he starts typing (content changes) or picks a
  // new mood (the act of selecting itself is engagement).
  useEffect(() => {
    setShowStartNudge(false);
    if (content.length > 0) return;
    const id = setTimeout(() => setShowStartNudge(true), 12000);
    return () => clearTimeout(id);
  }, [content, mood, moodSpecific]);

  // Clear post-save lineage references once the man starts writing
  // the next entry. The reference belongs to the previous reflection
  // — leaving it overhead while he begins a new one would feel like
  // the harbor failing to step back.
  useEffect(() => {
    if (content.length > 0 && pendingReferences.length > 0) {
      setPendingReferences([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // Story Series — when invitation_id is in the query string, fetch
  // the invitation + prompt. RLS guarantees we only see the member's
  // own invitations, so if it returns null the param is bogus and we
  // silently fall back to the standard composer.
  useEffect(() => {
    if (!invitationIdParam) {
      setStoryInvitation(null);
      setStoryPrompt(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const inv = await fetchInvitationById(supabase, invitationIdParam);
        if (cancelled || !inv) return;
        const prompt = await fetchPromptById(supabase, inv.prompt_id);
        if (cancelled || !prompt) return;
        setStoryInvitation(inv);
        setStoryPrompt(prompt);
        shownAtRef.current = Date.now();
      } catch (err) {
        console.warn("[journal] story invitation fetch failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationIdParam]);

  // Desktop save-then-redirect — fires once saving/savingEdit clears
  // back to false AFTER the desktop button set desktopSavingRef. We
  // verify success by checking that title+content cleared (new entry
  // path) or editingEntryId cleared (edit path); a failed save leaves
  // those populated so the member can correct and retry.
  useEffect(() => {
    if (!desktopSavingRef.current) return;
    if (saving || savingEdit) return; // Still in flight.
    // Saving has finished. Determine success based on cleared state.
    const newEntrySucceeded = title === "" && content === "";
    const editSucceeded = editingEntryId === null;
    if (newEntrySucceeded || editSucceeded) {
      desktopSavingRef.current = false;
      router.push("/journal");
    } else {
      // Save errored — leave the ref set so the next attempt can
      // re-trigger the redirect on success.
      desktopSavingRef.current = false;
    }
  }, [saving, savingEdit, title, content, editingEntryId, router]);

  // ?edit={id} handler — when the new /journal reader page clicks
  // "Edit" on an entry, it routes here with the entry id in the URL.
  // This effect picks that up, finds the entry in the loaded list,
  // and opens it in edit mode. Guarded by a ref so a refetch of
  // entries (which would change the `entries` reference) doesn't
  // re-init the edit and discard the user's in-progress changes.
  const editIdParam = searchParams.get("edit");
  const editParamProcessedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editIdParam || entries.length === 0) return;
    if (editParamProcessedRef.current === editIdParam) return;
    const entry = entries.find((e) => e.id === editIdParam);
    if (!entry) return;
    if (!isWithinEditWindow(entry.created_at)) return;
    setEditingEntryId(entry.id);
    setEditingDraft(entry.content);
    setEditingDraftTitle(entry.title ?? "");
    editParamProcessedRef.current = editIdParam;
  }, [editIdParam, entries]);

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.7;
    audio.loop = true;
    if (soundOn) {
      audio.pause();
      setSoundOn(false);
      return;
    }
    try {
      await audio.play();
      setSoundOn(true);
    } catch (error) {
      console.error("Audio playback failed:", error);
      setSoundOn(false);
    }
  }

  async function loadJournal() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    // Suspension gate — keep suspended members off member-facing surfaces.
    // Also fetch created_at and the three lineage columns so we can
    // compute progressive-disclosure thresholds and run the
    // reference-back matcher after each entry save.
    const { data: gateRow } = await supabase
      .from("profiles")
      .select(
        "suspended_at, created_at, lineage_father_grief, lineage_father_anger, lineage_pattern_to_leave",
      )
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }
    setUserId(user.id);
    setUserCreatedAt(gateRow?.created_at ?? null);
    setLineageContent({
      fatherGrief: gateRow?.lineage_father_grief ?? null,
      fatherAnger: gateRow?.lineage_father_anger ?? null,
      patternToLeave: gateRow?.lineage_pattern_to_leave ?? null,
    });
    const { data, error } = await supabase
      .from("journal_entries")
      .select(
        "id, title, original_title, content, original_content, mood, created_at, edited_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setEntries(data);
    }
    setLoading(false);
  }

  async function saveEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId || !content.trim()) return;
    setSaving(true);

    // Insert the journal entry and ask for its id back so we can
    // optionally link a body_check row to it. mood_specific is null
    // unless the man explicitly picked a sub-mood — the database
    // column allows null and the mood map handles either case.
    //
    // original_content and original_title are set on first save and
    // never touched again. Even if the member edits within the 6-hour
    // window, these preserve the in-the-moment voice for tone signal
    // and historical truth. Null titles stay null in both columns.
    const trimmedContent = content.trim();
    // For Story Series entries, the prompt IS the title. For mood we
    // take a "both-and" approach: when the man picks a Reflection Mood,
    // that selection drives both journal_entries.mood (so the entries
    // list shows the right color/icon) AND telemetry.reflection_mood
    // (the canonical signal Eidos reads — separate from generic daily
    // mood). When he doesn't pick, mood defaults to 'grounded'.
    const trimmedTitle = storyPrompt
      ? deriveTitleFromPrompt(storyPrompt.prompt_text)
      : title.trim() || null;
    const effectiveMood = storyPrompt ? (reflectionMood ?? "grounded") : mood;
    const effectiveMoodSpecific = storyPrompt ? null : moodSpecific;
    const { data: inserted, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        title: trimmedTitle,
        original_title: trimmedTitle,
        mood: effectiveMood,
        mood_specific: effectiveMoodSpecific,
        content: trimmedContent,
        original_content: trimmedContent,
      })
      .select("id")
      .single();

    if (!error && inserted) {
      // First-journal milestone (idempotent server-side via UNIQUE).
      trackMilestone("first_journal_entry");
      // If they used a sub-mood chip, that's its own milestone.
      if (moodSpecific) trackMilestone("first_sub_mood");

      // Eidos behavioral signal — fire-and-forget. The journal entry
      // is the canonical artifact and is already persisted; a missed
      // event push only costs the engine one data point and is logged
      // server-side. Reflection mood (Story Series only) rides as a
      // separate payload field so Eidos can distinguish it from the
      // daily mood signal.
      emitMemberEvent("journal.created", {
        mood: effectiveMood,
        mood_specific: effectiveMoodSpecific,
        length: trimmedContent.length,
        word_count: trimmedContent.split(/\s+/).filter(Boolean).length,
        reflection_mood: storyPrompt ? reflectionMood : null,
        is_story_prompt: Boolean(storyPrompt),
      });

      // Story Series — if this entry answers an invitation, mark it
      // answered, link the new journal entry, and persist the
      // engagement telemetry captured during writing. Failures here
      // don't block the journal flow; the entry is the canonical
      // artifact and is already saved.
      if (storyInvitation) {
        try {
          const telemetry: StoryTelemetry = {
            time_to_first_keystroke_ms:
              shownAtRef.current && firstKeystrokeAtRef.current
                ? Math.max(
                    0,
                    firstKeystrokeAtRef.current - shownAtRef.current,
                  )
                : undefined,
            total_writing_seconds: Math.round(activeMsRef.current / 1000),
            pauses_count: pausesRef.current,
            deletes_count: deletesRef.current,
            word_count: trimmedContent.split(/\s+/).filter(Boolean).length,
            reflection_mood: reflectionMood,
          };
          await markInvitationAnswered(
            supabase,
            storyInvitation.id,
            inserted.id,
            telemetry,
          );
          setStoryInvitation(null);
          setStoryPrompt(null);
          setReflectionMood(null);
          shownAtRef.current = null;
          firstKeystrokeAtRef.current = null;
          lastKeystrokeAtRef.current = null;
          activeMsRef.current = 0;
          pausesRef.current = 0;
          deletesRef.current = 0;
          prevLenRef.current = 0;
          // Remove the now-stale ?invitation_id= from the URL without
          // triggering a route transition (which would conflict with
          // the unsaved-changes guard while content is still in state
          // this tick). pure history API — no re-render, no nav event.
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", "/journal");
          }
        } catch (err) {
          console.warn("[journal] markInvitationAnswered failed:", err);
        }
      }

      // If the man did a body check before writing, link it to this
      // entry. Body checks are best-effort — a write failure here
      // should not block the journal flow.
      if (pendingBodySpots && pendingBodySpots.length >= 0) {
        await supabase.from("body_checks").insert({
          user_id: userId,
          journal_entry_id: inserted.id,
          spots: pendingBodySpots,
        });
        setPendingBodySpots(null);
        trackMilestone("first_body_check");
      }

      // Reference-back lineage. Scan the just-saved entry against
      // the man's lineage content. If any theme matches (e.g., he
      // wrote about "my father" or "the cycle"), surface the line he
      // wrote in his Lineage room. This connects today's entry back
      // to the long-arc story he's been writing across his account.
      // The references render above the textarea after save.
      const detectedThemes = detectLineageThemes(content);
      const references = resolveLineageReferences(
        detectedThemes,
        lineageContent,
      );
      setPendingReferences(references);

      setTitle("");
      setMood("grounded");
      setMoodSpecific(null);
      setContent("");
      await loadJournal();
    }
    setSaving(false);
  }

  async function deleteEntry(id: string) {
    const confirmed = window.confirm(t("alerts.deleteConfirm"));
    if (!confirmed) return;
    await supabase.from("journal_entries").delete().eq("id", id);
    await loadJournal();
  }

  /**
   * Open edit mode for an entry. The entry must still be within
   * its 6-hour edit window — the UI shouldn't render the affordance
   * outside the window, but we defensively re-check here too.
   */
  function beginEditingEntry(entry: JournalEntry) {
    if (!isWithinEditWindow(entry.created_at)) return;
    setEditingEntryId(entry.id);
    setEditingDraft(entry.content);
    setEditingDraftTitle(entry.title ?? "");
  }

  /** Discard the in-progress edit and return to the read view. */
  function cancelEditingEntry() {
    setEditingEntryId(null);
    setEditingDraft("");
    setEditingDraftTitle("");
  }

  /**
   * Save an edit to an existing entry. Mutates only `title`,
   * `content`, and `edited_at`; `original_title` and
   * `original_content` are never touched. The 6-hour window is
   * enforced here so a stale UI cannot bypass it (e.g., if the page
   * was left open past the window).
   */
  async function saveEditingEntry(entry: JournalEntry) {
    if (savingEdit) return;
    const trimmedContent = editingDraft.trim();
    if (!trimmedContent) {
      window.alert(t("alerts.editEmpty"));
      return;
    }
    if (!isWithinEditWindow(entry.created_at)) {
      window.alert(t("alerts.editWindowClosed"));
      cancelEditingEntry();
      await loadJournal();
      return;
    }
    // Title is allowed to be empty — that's the "untitled" state.
    // Trim and convert empty string to null so the DB column reflects
    // the untitled state consistently with how new entries are saved.
    const trimmedTitle = editingDraftTitle.trim() || null;
    setSavingEdit(true);
    const { error } = await supabase
      .from("journal_entries")
      .update({
        title: trimmedTitle,
        content: trimmedContent,
        edited_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
    setSavingEdit(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[journal] saveEditingEntry failed:", error);
      window.alert(t("alerts.editFailed"));
      return;
    }
    cancelEditingEntry();
    await loadJournal();
  }

  function formatEntryDateTime(dateValue: string) {
    return new Date(dateValue).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const filteredAndSortedEntries = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    let filtered = entries;
    if (normalizedSearch) {
      filtered = entries.filter((entry) => {
        const titleText = entry.title?.toLowerCase() ?? "";
        const moodText = entry.mood?.toLowerCase() ?? "";
        const contentText = entry.content.toLowerCase();
        return (
          titleText.includes(normalizedSearch) ||
          moodText.includes(normalizedSearch) ||
          contentText.includes(normalizedSearch)
        );
      });
    }
    return [...filtered].sort((a, b) => {
      if (sortOption === "newest") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      if (sortOption === "oldest") {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      if (sortOption === "mood") {
        return (a.mood ?? "").localeCompare(b.mood ?? "");
      }
      if (sortOption === "title") {
        return (a.title ?? "Untitled Entry").localeCompare(
          b.title ?? "Untitled Entry",
        );
      }
      return 0;
    });
  }, [entries, searchTerm, sortOption]);

  const streak = useMemo(() => computeStreak(entries), [entries]);
  const lastEntryDays = useMemo(() => daysSinceLastEntry(entries), [entries]);
  const moodMap = useMemo(() => buildMoodMap(entries), [entries]);
  const wordCount = useMemo(
    () => content.trim().split(/\s+/).filter(Boolean).length,
    [content],
  );

  useEffect(() => {
    loadJournal();
  }, []);

  // STYLED LOADING — breathing pulse, matches dashboard
  if (loading) {
    return (
      <main
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[var(--sh-bg-page)]`}
      >
        <div className="flex flex-col items-center">
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0.95, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="h-24 w-24 rounded-full border border-[#c4934e]/30"
            style={{
              background:
                "radial-gradient(circle, rgba(196,147,78,0.20) 0%, rgba(196,147,78,0.04) 70%, transparent 100%)",
            }}
          />
          <p
            className={`${serif.className} mt-8 text-2xl italic text-[var(--sh-text-secondary)]`}
          >
            {t("loading")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      // Height is responsive between the two render trees inside:
      //   - Mobile / tablet (< 1024px): min-h-screen so the existing
      //     scrollable form can grow naturally with content.
      //   - Desktop (lg+): h-full so the page fills only the available
      //     space inside the root layout's flex column (i.e., viewport
      //     minus the body-level GlobalCrisisFooter). The 988 crisis
      //     band sits permanently visible at the bottom; the desktop
      //     composer composes in the ~970px above.
      // lg:min-h-0 disables the mobile min on desktop so h-full isn't
      // fighting against a 100vh floor.
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)] lg:h-full lg:min-h-0`}
    >
      <InactivityGate />
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      {/*
       * ═══════════════════════════════════════════════════════════════
       * MOBILE / TABLET render tree (viewport < 1024px).
       *
       * Everything inside this `lg:hidden` wrapper is the journal
       * experience that existed before the desktop redesign — top nav,
       * ambience backdrop, prompt panel, title field, mood picker,
       * body textarea, entries list, mood map, save button. It is
       * intentionally preserved untouched so the mobile / tablet
       * experience members tested previously continues to work
       * identically. Any future change here must be CSS-only (e.g.,
       * Tailwind responsive classes that don't disturb the mobile
       * layout) or get its own corresponding desktop equivalent.
       *
       * Mobile is also where members who hit /journal on a small
       * viewport land — the new /journal/page.tsx client-redirects
       * them here (see that file's mobile-detection useEffect). So
       * this wrapper carries the canonical "small-screen journal"
       * experience for the entire app.
       * ═══════════════════════════════════════════════════════════════
       */}
      <div className="lg:hidden">

      {/* Unified harbor ambience — same on every authenticated page */}
      <PageAmbience />

      {/* SOUND TOGGLE */}
      <button
        onClick={toggleSound}
        className={`fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-none border shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-2xl transition duration-300 hover:scale-110 ${
          isDusk
            ? "border-white/20 bg-white/[0.08] text-white hover:bg-white/[0.14]"
            : "border-white/40 bg-white/30 text-[var(--sh-text-primary)] hover:bg-white/45"
        }`}
        aria-label={soundOn ? t("soundMute") : t("soundPlay")}
        title={soundOn ? t("soundMute") : t("soundPlay")}
      >
        {soundOn ? <SoundOn size={16} /> : <SoundOff size={16} />}
      </button>

      {/* Canonical TOP NAV — shared component, see pageTopNav.tsx */}
      <PageTopNav />

      <section className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 pb-10 md:px-8">
        {/* GREETING STRIP — streak + prompt + privacy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={`mb-10 grid gap-6 border-y px-6 py-7 backdrop-blur-sm md:grid-cols-4 ${
            isDusk
              ? "border-white/10 bg-black/25"
              : "border-[var(--sh-border-subtle)] bg-white/40"
          }`}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
              {t(`timeGreeting.${timeGreetingKey()}`)}
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[#a9793d]`}
            >
              {t("greeting")}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                {t("streakLabel")}
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
            >
              {streak === 0
                ? t("streakBegin")
                : streak === 1
                  ? t("streakDayOne")
                  : t("streakDayN", { count: streak })}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              {lastEntryDays === null
                ? t("lastNever")
                : lastEntryDays === 0
                  ? t("lastToday")
                  : lastEntryDays === 1
                    ? t("lastYesterday")
                    : t("lastDays", { count: lastEntryDays })}
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Speech size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                {t("promptLabel")}
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-xl italic leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
            >
              &ldquo;{todaysPrompt()}&rdquo;
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              {t("promptHelp")}
            </p>
          </div>
        </motion.div>

        {/* MAIN GRID */}
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          {/* COMPOSER */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className={`rounded-none border p-8 backdrop-blur-2xl md:p-12 ${
              isDusk
                ? "border-white/10 bg-black/30 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
                : "border-white/50 bg-white/75 shadow-[0_20px_80px_rgba(0,0,0,0.08)]"
            }`}
          >
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              {t("eyebrow")}
            </p>
            <h1
              className={`${serif.className} text-5xl font-medium leading-tight md:text-6xl`}
            >
              {t("title")}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[var(--sh-text-secondary)]">
              {t("privacy")}
            </p>

            {/* LINEAGE REFERENCE — surfaces after a save if the just-saved
                entry touched a theme the man has written about in his
                Lineage room. Quietly connects today's reflection to the
                long-arc story he's been writing. Clears the moment he
                starts the next entry. */}
            {pendingReferences.length > 0 && (
              <div className="mt-8">
                <LineageReference
                  references={pendingReferences}
                  onDismiss={() => setPendingReferences([])}
                />
              </div>
            )}

            <form onSubmit={saveEntry} className="mt-10">
              {/* STORY PROMPT HEADER — only when /journal was opened
                  via a Story invitation. Renders the prompt as the
                  title (non-editable). The man's response IS his
                  answer to this question; a man-written title would
                  just duplicate the prompt. The reflection-mood
                  picker below replaces the generic mood for this
                  surface. */}
              {storyPrompt ? (
                <div
                  className={`mb-8 border-l-2 px-4 py-4 md:mb-10 md:px-5 md:py-5 ${
                    isDusk
                      ? "border-[#c4934e] bg-black/20"
                      : "border-[#a9793d] bg-[#f6f0e6]"
                  }`}
                >
                  <p
                    className={`mb-2 text-[10px] font-bold uppercase tracking-[0.28em] ${
                      isDusk ? "text-[#c4934e]" : "text-[#a9793d]"
                    }`}
                  >
                    {t("storyHeader")}
                  </p>
                  <p
                    className={`${serif.className} text-lg italic leading-snug md:text-xl ${
                      isDusk ? "text-stone-100" : "text-stone-900"
                    }`}
                  >
                    &ldquo;{storyPrompt.prompt_text}&rdquo;
                  </p>
                </div>
              ) : (
                <>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                    {t("titleLabel")}
                  </label>
                  <VentInput
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mb-6"
                    placeholder={t("titlePlaceholder")}
                  />
                </>
              )}

              {/* MOOD PICKER — only on plain reflections. Story responses
                  are about memory, not present-tense feeling; the
                  reflection-mood picker below the textarea handles that
                  question separately. */}
              {!storyPrompt && (
                <>
              <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                {t("moodLabel")}
              </label>
              <div className="mb-6 flex flex-wrap gap-2">
                {moodOptions.map((option) => {
                  const active = mood === option.value;
                  const Icon = moodIcons[option.value];
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setMood(option.value as Mood);
                        // Clear sub-mood when parent mood changes;
                        // "resentful" doesn't apply to "hopeful," etc.
                        setMoodSpecific(null);
                      }}
                      className="flex items-center gap-2 border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] transition"
                      style={{
                        borderColor: active
                          ? option.color
                          : isDusk
                            ? "rgba(255,255,255,0.15)"
                            : "#d6d3d1",
                        color: active
                          ? option.color
                          : isDusk
                            ? "rgba(255,255,255,0.7)"
                            : "#57534e",
                        backgroundColor: active
                          ? isDusk
                            ? "rgba(255,255,255,0.1)"
                            : "#ffffff"
                          : isDusk
                            ? "rgba(255,255,255,0.04)"
                            : "#f8f4ed",
                        boxShadow: active
                          ? `inset 0 0 0 1px ${option.color}`
                          : undefined,
                      }}
                    >
                      <Icon
                        size={14}
                        strokeWidth={1.5}
                        style={{ color: option.color }}
                      />
                      {tMood(option.value)}
                    </button>
                  );
                })}
              </div>

              {/* SUB-MOOD CHIPS — gated by FEATURE_THRESHOLDS.subMoods.
                  Appears around day 60 of the member's account, after he
                  has used the basic 6-mood picker enough times to feel
                  its limit organically. Five granular options per parent
                  mood plus "something else." Selection is optional and
                  saves to journal_entries.mood_specific. */}
              {isFeatureUnlocked(
                userCreatedAt,
                FEATURE_THRESHOLDS.subMoods,
              ) && (
                <SubMoods
                  mood={mood}
                  value={moodSpecific}
                  onChange={setMoodSpecific}
                />
              )}
                </>
              )}

              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label className="block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                  {t("reflectionLabel")}
                </label>
                {/* BODY-CHECK INVITATION — gated by FEATURE_THRESHOLDS.bodyCheck.
                    Appears in the man's experience around day 30 of his account.
                    Soft, optional, no completion shame: if he taps it, the
                    overlay opens; if he ignores it, the journal works as before.
                    If he already did a check this session, the line becomes a
                    quiet confirmation so the moment is visible to him. */}
                {isFeatureUnlocked(
                  userCreatedAt,
                  FEATURE_THRESHOLDS.bodyCheck,
                ) && (
                  <button
                    type="button"
                    onClick={() => setBodyCheckOpen(true)}
                    className="text-[10px] italic tracking-wide text-[var(--sh-accent-gold)] transition hover:opacity-80"
                  >
                    {pendingBodySpots === null
                      ? t("bodyCheckOffer")
                      : pendingBodySpots.length === 0
                        ? t("bodyCheckComplete")
                        : t("bodyCheckNoticed", { spots: pendingBodySpots.join(", ") })}
                  </button>
                )}
              </div>
              <VentTextarea
                required
                value={content}
                onChange={(e) => {
                  const next = e.target.value;
                  // Telemetry — only meaningful when a Story prompt is active.
                  if (storyInvitation) {
                    const now = Date.now();
                    if (
                      firstKeystrokeAtRef.current === null &&
                      next.length > 0
                    ) {
                      firstKeystrokeAtRef.current = now;
                    }
                    if (lastKeystrokeAtRef.current !== null) {
                      const gap = now - lastKeystrokeAtRef.current;
                      if (gap < 30_000) activeMsRef.current += gap;
                      if (gap >= 5_000) pausesRef.current += 1;
                    }
                    lastKeystrokeAtRef.current = now;
                    if (prevLenRef.current - next.length >= 10) {
                      deletesRef.current += 1;
                    }
                    prevLenRef.current = next.length;
                  }
                  setContent(next);
                }}
                rows={9}
                className="mb-2"
                placeholder={
                  storyPrompt ? t("storyPlaceholder") : t("reflectionPlaceholder")
                }
              />
              {/* "Start with one word" — appears only when the textarea
                  has been empty for 12s. The 5-second-rule pattern, in
                  the harbor's voice: not a countdown, not pressure, just
                  permission to begin badly. Fades away the moment he
                  types anything. */}
              {showStartNudge && content.length === 0 && (
                <p className="mb-2 text-[11px] italic leading-relaxed text-[var(--sh-text-tertiary)]">
                  {t("startNudge")}
                </p>
              )}
              <div className="mb-8 flex items-center justify-between text-xs text-[var(--sh-text-tertiary)]">
                <span>
                  {wordCount === 0
                    ? t("wordsZero")
                    : wordCount === 1
                      ? t("wordsOne")
                      : t("wordsMany", { count: wordCount })}
                </span>
                <span className="italic">{t("privateLine")}</span>
              </div>

              {/* REFLECTION MOOD — only on Story responses. Optional.
                  Distinct from the generic daily mood: this captures how
                  the memory itself sits with the man, AFTER writing.
                  Mirrors to journal_entries.mood so the entries list
                  displays it, AND persists to telemetry.reflection_mood
                  as the canonical Eidos signal. */}
              {storyPrompt && (
                <div className="mb-8">
                  <label
                    className={`mb-3 block text-xs italic ${
                      isDusk ? "text-stone-400" : "text-stone-600"
                    }`}
                  >
                    {t("reflectionMoodLabel")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {moodOptions.map((option) => {
                      const active = reflectionMood === option.value;
                      const Icon = moodIcons[option.value];
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setReflectionMood(
                              active
                                ? null
                                : (option.value as NonNullable<
                                    StoryTelemetry["reflection_mood"]
                                  >),
                            )
                          }
                          className="flex items-center gap-2 border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] transition"
                          style={{
                            borderColor: active
                              ? option.color
                              : isDusk
                                ? "rgba(255,255,255,0.15)"
                                : "#d6d3d1",
                            color: active
                              ? option.color
                              : isDusk
                                ? "rgba(255,255,255,0.7)"
                                : "#57534e",
                            backgroundColor: active
                              ? isDusk
                                ? "rgba(255,255,255,0.08)"
                                : "#ffffff"
                              : isDusk
                                ? "rgba(255,255,255,0.03)"
                                : "#f8f4ed",
                            boxShadow: active
                              ? `inset 0 0 0 1px ${option.color}`
                              : undefined,
                          }}
                        >
                          <Icon
                            size={14}
                            strokeWidth={1.5}
                            style={{ color: option.color }}
                          />
                          {tMood(option.value)}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={`mt-2 text-[10px] italic ${
                      isDusk ? "text-stone-500" : "text-stone-500"
                    }`}
                  >
                    {t("reflectionMoodHelp")}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="group relative w-full overflow-hidden rounded-none border border-[#f4d7a1]/50 bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.18)] transition duration-300 hover:scale-[1.02] hover:bg-[#8d6432] disabled:opacity-60 disabled:hover:scale-100"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
                <span className="relative z-10">
                  {saving ? t("savingDots") : t("save")}
                </span>
              </button>
            </form>
          </motion.div>

          {/* ENTRIES */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className={`rounded-none border p-8 backdrop-blur-2xl md:p-10 ${
              isDusk
                ? "border-white/10 bg-black/30 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
                : "border-white/50 bg-white/60 shadow-[0_20px_80px_rgba(0,0,0,0.06)]"
            }`}
          >
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  {t("entriesEyebrow")}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  {t("showingCount", { shown: filteredAndSortedEntries.length, total: entries.length })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSortOption("newest");
                }}
                className={`w-fit rounded-none border px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] transition hover:border-[var(--sh-accent-gold)] ${
                  isDusk
                    ? "border-white/15 bg-white/[0.04] text-[var(--sh-text-secondary)] hover:bg-white/[0.08]"
                    : "border-[var(--sh-border-medium)] bg-white/60 text-[var(--sh-text-secondary)] hover:bg-white"
                }`}
              >
                {t("reset")}
              </button>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-[1fr_0.55fr]">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  {t("searchLabel")}
                </label>
                <VentInput
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  {t("sortLabel")}
                </label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className={`w-full rounded-none border px-5 py-4 outline-none transition focus:border-[var(--sh-accent-gold)] ${
                    isDusk
                      ? "border-white/15 bg-white/[0.04] text-white"
                      : "border-[var(--sh-border-medium)] bg-[#f8f4ed] text-[var(--sh-text-primary)]"
                  }`}
                >
                  <option value="newest">{t("sortNewest")}</option>
                  <option value="oldest">{t("sortOldest")}</option>
                  <option value="mood">{t("sortMood")}</option>
                  <option value="title">{t("sortTitle")}</option>
                </select>
              </div>
            </div>

            {entries.length === 0 ? (
              <div
                className={`rounded-none border p-8 ${
                  isDusk
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                }`}
              >
                <p
                  className={`${serif.className} text-3xl italic text-[var(--sh-text-secondary)]`}
                >
                  {t("emptyTitle")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  {t("emptySub")}
                </p>
              </div>
            ) : filteredAndSortedEntries.length === 0 ? (
              <div
                className={`rounded-none border p-8 text-[var(--sh-text-secondary)] ${
                  isDusk
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                }`}
              >
                {t("emptySearch")}
              </div>
            ) : (
              <div className="max-h-[720px] space-y-5 overflow-y-auto pr-2">
                {filteredAndSortedEntries.map((entry) => {
                  const color = moodColor(entry.mood);
                  const EntryMoodIcon = moodIconFor(entry.mood);
                  return (
                    <article
                      key={entry.id}
                      className={`rounded-none border p-6 transition hover:border-[var(--sh-accent-gold)]/40 ${
                        isDusk
                          ? "border-white/10 bg-white/[0.03] backdrop-blur-sm"
                          : "border-[var(--sh-border-subtle)] bg-[#f8f4ed]"
                      }`}
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <span
                            className="inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                            style={{
                              borderColor: color,
                              color,
                              backgroundColor: isDusk
                                ? "rgba(255,255,255,0.06)"
                                : "white",
                            }}
                          >
                            {EntryMoodIcon ? (
                              <EntryMoodIcon
                                size={12}
                                strokeWidth={1.5}
                                style={{ color }}
                              />
                            ) : (
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            )}
                            {moodLabel(entry.mood, tMood, t)}
                          </span>
                          <h2
                            className={`${serif.className} mt-3 text-3xl font-medium text-[var(--sh-text-primary)]`}
                          >
                            {entry.title || t("untitled")}
                          </h2>
                          {(() => {
                            // Capture edited_at in a const so TypeScript's
                            // null narrowing survives the JSX boundary. The
                            // previous inline `{entry.edited_at && ...}`
                            // pattern works at dev-time but the production
                            // build (stricter type-check) sometimes loses
                            // the narrowing inside the JSX expression.
                            const editedAt = entry.edited_at;
                            return (
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sh-text-muted)]">
                                {formatEntryDateTime(entry.created_at)}
                                {editedAt && (
                                  <span className="ml-2 text-[10px] font-normal italic normal-case tracking-normal text-[var(--sh-text-muted)]">
                                    · {t("edited")} {formatEntryDateTime(editedAt)}
                                  </span>
                                )}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          {/* Edit affordance — only rendered while the
                              6-hour window is open. After the window
                              expires, the button disappears entirely
                              and the entry locks in its current
                              (edited or original) state. */}
                          {isWithinEditWindow(entry.created_at) &&
                            editingEntryId !== entry.id && (
                              <button
                                onClick={() => beginEditingEntry(entry)}
                                className="rounded-none border border-[var(--sh-border-medium)] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)] transition hover:border-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold)]"
                              >
                                {t("editEntry")}
                              </button>
                            )}
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="rounded-none border border-[var(--sh-border-medium)] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)] transition hover:border-red-300 hover:text-red-600"
                          >
                            {t("delete")}
                          </button>
                        </div>
                      </div>

                      {editingEntryId === entry.id ? (
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={editingDraftTitle}
                            onChange={(e) =>
                              setEditingDraftTitle(e.target.value)
                            }
                            className={`w-full rounded-none border px-4 py-2 text-sm outline-none transition focus:ring-2 focus:ring-[#586558]/30 ${
                              isDusk
                                ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-white/30 focus:border-[#c4934e]"
                                : "border-stone-300 bg-[#f8f4ed] text-stone-800 placeholder:text-stone-400 focus:border-[#a9793d]"
                            }`}
                            placeholder={t("editTitlePlaceholder")}
                            autoFocus
                          />
                          <textarea
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            rows={Math.max(4, Math.min(12, editingDraft.split("\n").length + 1))}
                            className={`w-full resize-none rounded-none border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#586558]/30 ${
                              isDusk
                                ? "border-white/15 bg-black/40 text-stone-100 placeholder:text-white/30 focus:border-[#c4934e]"
                                : "border-stone-300 bg-[#f8f4ed] text-stone-800 placeholder:text-stone-400 focus:border-[#a9793d]"
                            }`}
                            placeholder={t("editBodyPlaceholder")}
                          />
                          <p className="text-xs italic text-[var(--sh-text-muted)]">
                            {t("editHelp")}
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                              onClick={cancelEditingEntry}
                              disabled={savingEdit}
                              className="rounded-none border border-[var(--sh-border-medium)] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)] transition hover:border-[var(--sh-text-secondary)] hover:text-[var(--sh-text-primary)] disabled:opacity-60"
                            >
                              {t("cancel")}
                            </button>
                            <button
                              onClick={() => saveEditingEntry(entry)}
                              disabled={savingEdit || !editingDraft.trim()}
                              className="rounded-none border border-[var(--sh-accent-gold)] bg-[#a9793d] px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
                            >
                              {savingEdit ? t("savingEdit") : t("saveEdit")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed text-[var(--sh-text-secondary)]">
                          {entry.content}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>

        {/* MOOD MAP — 30-day pattern recognition (variable reward) */}
        {entries.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
            className={`mt-10 rounded-none border p-8 backdrop-blur-sm ${
              isDusk
                ? "border-white/10 bg-black/30"
                : "border-[var(--sh-border-subtle)] bg-white/70"
            }`}
          >
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  {t("patternEyebrow")}
                </p>
                <h2
                  className={`${serif.className} mt-2 text-4xl font-medium text-[var(--sh-text-primary)] md:text-5xl`}
                >
                  {t("patternTitle")}
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  {t("patternSub")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {moodOptions.map((option) => {
                  const Icon = moodIcons[option.value];
                  return (
                    <span
                      key={option.value}
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--sh-text-tertiary)]"
                    >
                      <Icon
                        size={14}
                        strokeWidth={1.5}
                        style={{ color: option.color }}
                      />
                      {tMood(option.value)}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-10 gap-1.5 sm:grid-cols-15 md:grid-cols-30">
              {moodMap.map((day, i) => {
                const c = day.mood ? moodColor(day.mood) : "#e7e0d3";
                return (
                  <div
                    key={i}
                    title={`${day.date.toLocaleDateString()}${
                      day.mood
                        ? ` · ${moodLabel(day.mood, tMood, t)}`
                        : ` · ${t("noEntryTooltip")}`
                    }`}
                    className="aspect-square w-full transition hover:scale-110"
                    style={{
                      backgroundColor: c,
                      opacity: day.mood ? 1 : 0.35,
                    }}
                  />
                );
              })}
            </div>
          </motion.section>
        )}
      </section>

      {/* ─── end MOBILE / TABLET render tree ───
          Anything outside this wrapper renders on BOTH mobile and
          desktop — currently just the shared modals below. */}
      </div>

      {/*
       * ═══════════════════════════════════════════════════════════════
       * DESKTOP render tree (viewport >= 1024px).
       *
       * Literary writing surface that matches the /journal reader's
       * design language: anchor + Stone Harbor · Journal header, Today's
       * Anchor strip, two-pane layout, serif italic body, gold actions,
       * engraved horizon tailpiece. Same state and handlers as mobile —
       * only the visual surface changes.
       *
       * Form bindings are conditional:
       *   - When editingEntryId is set → title input binds to
       *     editingDraftTitle, body binds to editingDraft, Save calls
       *     saveEditingEntry, Cancel calls cancelEditingEntry.
       *   - Otherwise (new entry mode) → title input binds to title,
       *     body binds to content, Save calls saveEntry via form submit.
       *
       * Both flows redirect to /journal on success via the desktop
       * save-then-redirect useEffect at the top of the component.
       * ═══════════════════════════════════════════════════════════════
       */}
      {/* lg:h-full (was lg:h-screen): desktop wrapper now inherits
          main's responsive height — which on lg+ is h-full = viewport
          minus the body-level crisis footer. The 988 band stays
          permanently visible at the bottom. */}
      <div className="hidden text-[var(--sh-text-primary)] lg:flex lg:h-full lg:w-full lg:flex-col lg:overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col">
          {/* ===== Top header ===== */}
          <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
            <Link
              href="/journal"
              className="flex items-center gap-3"
              aria-label="Back to Journal"
            >
              <AnchorMark size={32} />
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-primary)]`}
              >
                Stone Harbor
              </span>
              <span className="text-[16px] text-[var(--sh-text-muted)]">
                ·
              </span>
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
              >
                Journal
              </span>
            </Link>
          </header>

          {/* ===== Today's Anchor strip =====
              Daily prompt + a "Use this prompt" link that pre-fills the
              body textarea if it's currently empty. Members who don't
              want a prompt can simply ignore the link and start writing. */}
          <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-5">
            <p
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
            >
              {t("promptLabel")}
            </p>
            <p
              className={`${serif.className} mt-1.5 text-[20px] italic font-medium tracking-[-0.01em]`}
            >
              {todaysPrompt()}
            </p>
            {!editingEntryId && content.length === 0 && (
              <button
                type="button"
                onClick={() => setContent(todaysPrompt() + "\n\n")}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)]`}
              >
                Use this prompt →
              </button>
            )}
          </section>

          {/* ===== Two-pane main area =====
              min-h-0 lets the inner scroll/flex children respect bounds. */}
          <main className="flex min-h-0 flex-1">
            {/* ───── SIDEBAR — recent entries (ghosted) ─────
                Shows the last 7 entries with mood dot + date + truncated
                title. Lower opacity than the reader's sidebar because
                here the goal is gentle context, not active navigation.
                Clicking an entry routes back to /journal so the member
                can read it; the composer stays focused on writing. */}
            <aside
              className="flex w-[340px] flex-col gap-3.5 overflow-y-auto border-r border-[var(--sh-border-subtle)] px-6 pb-6 pt-8"
              style={{ scrollbarWidth: "none" }}
            >
              <p
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
              >
                {t("entriesEyebrow")}
              </p>
              <div className="flex flex-col gap-1">
                {entries.slice(0, 7).map((e) => (
                  <Link
                    key={e.id}
                    href="/journal"
                    className="block px-3.5 py-3 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: desktopMoodDotColor(e.mood) }}
                      />
                      <span
                        className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
                      >
                        {desktopFormatDate(e.created_at)}
                      </span>
                    </div>
                    <p
                      className={`${serif.className} mt-1 truncate text-[14px] font-medium leading-[1.25] text-[var(--sh-text-secondary)]`}
                    >
                      {e.title?.trim() || t("untitled")}
                    </p>
                  </Link>
                ))}
              </div>
            </aside>

            {/* ───── WRITING PANE ───── */}
            <section className="flex min-h-0 flex-1 flex-col px-24 pt-8">
              {/* Actions row — gold Save (+ Cancel when editing) */}
              <div className="flex flex-shrink-0 justify-end gap-6">
                {editingEntryId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const entry = entries.find(
                          (x) => x.id === editingEntryId,
                        );
                        if (!entry) return;
                        desktopSavingRef.current = true;
                        void saveEditingEntry(entry);
                      }}
                      disabled={savingEdit}
                      style={{ outline: "none", outlineOffset: 0 }}
                      className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
                    >
                      {savingEdit ? t("savingEdit") : t("saveEdit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cancelEditingEntry();
                        router.push("/journal");
                      }}
                      style={{ outline: "none", outlineOffset: 0 }}
                      className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)]`}
                    >
                      {t("cancel")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      desktopSavingRef.current = true;
                      desktopFormRef.current?.requestSubmit();
                    }}
                    disabled={saving || content.trim().length === 0}
                    style={{ outline: "none", outlineOffset: 0 }}
                    className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
                  >
                    {saving ? t("saving") : t("save")}
                  </button>
                )}
              </div>

              {/* Writing surface — form for new entries; bound to edit
                  drafts when editingEntryId is set. */}
              <form
                ref={desktopFormRef}
                onSubmit={saveEntry}
                className="flex min-h-0 flex-1 flex-col"
              >
                {/* Story Series invitation card — quiet inline note
                    above the title when an invitation drove this flow.
                    The full mobile UX is heavier; on desktop we keep
                    it spare so the writing isn't crowded. */}
                {storyInvitation && storyPrompt && (
                  <div className="mt-6 border-l-2 border-[var(--sh-accent-gold)] pl-4">
                    <p
                      className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)]`}
                    >
                      {t("storyHeader")}
                    </p>
                    <p
                      className={`${serif.className} mt-2 text-[16px] italic leading-[1.5] text-[var(--sh-text-secondary)]`}
                    >
                      {storyPrompt.prompt_text}
                    </p>
                  </div>
                )}

                {/* Title input — serif italic placeholder, no border,
                    letterpress depression on sunlit (matches the reader's
                    title treatment). */}
                <input
                  type="text"
                  value={editingEntryId ? editingDraftTitle : title}
                  onChange={(e) =>
                    editingEntryId
                      ? setEditingDraftTitle(e.target.value)
                      : setTitle(e.target.value)
                  }
                  placeholder={t("titlePlaceholder")}
                  style={
                    !isDusk
                      ? {
                          textShadow:
                            "0 1px 0 rgba(255,248,235,0.55), 0 -0.5px 0 rgba(60,40,15,0.08)",
                          outline: "none",
                          outlineOffset: 0,
                        }
                      : { outline: "none", outlineOffset: 0 }
                  }
                  className={`${serif.className} mt-6 flex-shrink-0 bg-transparent text-[44px] font-medium leading-[1.1] tracking-[-0.015em] text-[var(--sh-text-primary)] placeholder:font-normal placeholder:italic placeholder:text-[var(--sh-text-muted)]`}
                />

                {/* Body textarea — fills remaining space, serif italic,
                    matches the reader's body text exactly so writing and
                    reading rhyme visually. */}
                <textarea
                  value={editingEntryId ? editingDraft : content}
                  onChange={(e) =>
                    editingEntryId
                      ? setEditingDraft(e.target.value)
                      : setContent(e.target.value)
                  }
                  placeholder={t("reflectionPlaceholder")}
                  style={{ outline: "none", outlineOffset: 0 }}
                  className={`${serif.className} mt-7 flex-1 resize-none bg-transparent text-[18px] italic leading-[1.65] text-[var(--sh-text-secondary)] placeholder:text-[var(--sh-text-muted)]`}
                />

                {/* ───── Mood row — centered close ─────
                    Composed vertically as part of the writing-close
                    ceremony that ends with the horizon mark below.
                    Three centered moments stack:
                      1. Small "MOOD" eyebrow (matches "TODAY'S PROMPT"
                         family at the top of the page).
                      2. The 8 mood chips as a flex-wrap row, justified
                         to center. On narrow desktop widths (1024-1200px)
                         the chips can wrap to two rows; both read fine.
                      3. The optional "Notice your body?" link as a
                         quieter centered offer below the chips.
                    Each chip: dot + uppercase label. Selected gets the
                    engraved-gold tint + warm background; others sit in
                    text-tertiary. Body-check overlay is the existing
                    shared modal mounted at <main> level. */}
                <div className="mt-6 flex flex-shrink-0 flex-col items-center gap-3 pb-2">
                  <p
                    className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
                  >
                    {t("moodLabel")}
                  </p>
                  <div className="flex max-w-[640px] flex-wrap justify-center gap-x-3.5 gap-y-2">
                    {moodOptions.map((opt) => {
                      const isSelected = mood === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMood(opt.value as Mood)}
                          style={{ outline: "none", outlineOffset: 0 }}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                            isSelected
                              ? "bg-[rgba(196,147,78,0.08)]"
                              : "hover:bg-white/[0.02]"
                          }`}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: desktopMoodDotColor(opt.value),
                            }}
                          />
                          <span
                            className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.22em]`}
                            style={{
                              color: isSelected
                                ? desktopMoodLabelColor(
                                    opt.value,
                                    isDusk ? "dusk" : "sunlit",
                                  )
                                : "var(--sh-text-tertiary)",
                            }}
                          >
                            {tMood(opt.value)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Body check link — quiet centered offer, only when
                      the feature is unlocked by account age (same gate
                      the mobile UX uses). pendingBodySpots is
                      BodySpot[] | null, so we defensively coerce length
                      to 0 when null. */}
                  {isFeatureUnlocked(
                    userCreatedAt,
                    FEATURE_THRESHOLDS.bodyCheck,
                  ) && (
                    <button
                      type="button"
                      onClick={() => setBodyCheckOpen(true)}
                      style={{ outline: "none", outlineOffset: 0 }}
                      className={`${sans.className} mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
                    >
                      {(pendingBodySpots?.length ?? 0) > 0
                        ? t("bodyCheckNoticed", {
                            spots: String(pendingBodySpots?.length ?? 0),
                          })
                        : t("bodyCheckOffer")}
                    </button>
                  )}
                </div>
              </form>

              {/* ───── Horizon tailpiece — visual close ─────
                  Same engraved rule + breathing anchor + voice signature
                  as the reader. Composer and reader bookend each other:
                  the writing is the act, the harbor is the witness. */}
              <div
                className="relative flex flex-shrink-0 flex-col items-center justify-start pt-4 pb-6"
                style={{ minHeight: "150px" }}
              >
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
                      background: isDusk
                        ? "linear-gradient(to right, transparent 0%, rgba(196,147,78,0.35) 50%, rgba(196,147,78,0.85) 100%)"
                        : "linear-gradient(to right, transparent 0%, rgba(169,121,61,0.45) 50%, rgba(169,121,61,0.95) 100%)",
                      boxShadow: isDusk
                        ? "0 0 4px rgba(196,147,78,0.28)"
                        : "0 1px 0 rgba(60,40,15,0.18)",
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
                    <AnchorMark
                      size={20}
                      shaftHeight={42}
                      fill="var(--sh-accent-gold)"
                    />
                  </motion.div>
                  <div
                    aria-hidden="true"
                    className="h-px flex-1"
                    style={{
                      background: isDusk
                        ? "linear-gradient(to right, rgba(196,147,78,0.85) 0%, rgba(196,147,78,0.35) 50%, transparent 100%)"
                        : "linear-gradient(to right, rgba(169,121,61,0.95) 0%, rgba(169,121,61,0.45) 50%, transparent 100%)",
                      boxShadow: isDusk
                        ? "0 0 4px rgba(196,147,78,0.28)"
                        : "0 1px 0 rgba(60,40,15,0.18)",
                    }}
                  />
                </motion.div>
                <p
                  className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
                >
                  The harbor is patient.
                </p>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* BODY CHECK OVERLAY — invitation only, optional always.
          Mounted at page level (not inside the form) so the backdrop
          can cover the full screen. The spots the man taps are held
          in `pendingBodySpots` until the next journal entry is saved,
          at which point they are linked to that entry in body_checks. */}
      <BodyCheck
        open={bodyCheckOpen}
        onClose={() => setBodyCheckOpen(false)}
        onContinue={(spots) => {
          setPendingBodySpots(spots);
          setBodyCheckOpen(false);
        }}
      />
      <UnsavedChangesModal
        open={journalUnsaved.showModal}
        onStay={journalUnsaved.cancelNavigation}
        onLeave={journalUnsaved.confirmNavigation}
        bodyLabel={t("unsavedBody")}
      />
    </main>
  );
}
