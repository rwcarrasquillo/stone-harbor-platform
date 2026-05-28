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
import { supabase } from "@/lib/supabaseClient";
import { trackMilestone } from "@/lib/memberUsage";
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
const moodOptions = [
  { value: "grounded", label: "Grounded", color: "#586558" },
  { value: "confused", label: "Confused", color: "#9c8a6e" },
  { value: "angry", label: "Angry", color: "#a05a3c" },
  { value: "sad", label: "Sad", color: "#5d6a78" },
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

function moodLabel(value: string | null | undefined) {
  if (!value) return "Reflection";
  const found = moodOptions.find((o) => o.value === value.toLowerCase());
  return found ? found.label : value;
}

// Daily writing prompts live in @/lib/dailyPrompts so the dashboard's
// "Tomorrow" preview tile can read from the same source. Add or edit
// prompts there — both surfaces pick them up automatically.
function todaysPrompt() {
  return sharedTodaysPrompt();
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Tonight";
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
  const moodByDate = new Map<string, string>();
  // Use the FIRST (most recent) entry per day since they're already sorted desc.
  for (const entry of entries) {
    const key = new Date(entry.created_at).toDateString();
    if (!moodByDate.has(key)) {
      moodByDate.set(key, entry.mood ?? "grounded");
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
    const trimmedTitle = title.trim() || null;
    const { data: inserted, error } = await supabase
      .from("journal_entries")
      .insert({
        user_id: userId,
        title: trimmedTitle,
        original_title: trimmedTitle,
        mood,
        mood_specific: moodSpecific,
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
    const confirmed = window.confirm("Delete this journal entry?");
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
      window.alert(
        "Entry body can't be empty. Cancel instead to leave as-is.",
      );
      return;
    }
    if (!isWithinEditWindow(entry.created_at)) {
      window.alert(
        "The edit window for this entry has closed. The original is preserved.",
      );
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
      window.alert("Couldn't save the edit. Try again in a moment.");
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
            Opening your journal…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[var(--sh-bg-page)] text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

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
        aria-label={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
        title={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
      >
        {soundOn ? <SoundOn size={16} /> : <SoundOff size={16} />}
      </button>

      <section className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 py-10 md:px-8">
        {/* TOP NAV */}
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Return To Harbor
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)] transition hover:text-[#a9793d]"
          >
            Stone Harbor
          </Link>
        </div>

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
              {timeGreeting()}
            </p>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[#a9793d]`}
            >
              Write what you cannot carry alone.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                Writing Streak
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-[var(--sh-text-primary)]`}
            >
              {streak === 0
                ? "Begin today."
                : streak === 1
                  ? "Day 1."
                  : `Day ${streak}.`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              {lastEntryDays === null
                ? "Your first entry is the heaviest. Then they get lighter."
                : lastEntryDays === 0
                  ? "You wrote today. Stay a little longer."
                  : lastEntryDays === 1
                    ? "You wrote yesterday. The harbor is open."
                    : `Your last entry was ${lastEntryDays} days ago.`}
            </p>
          </div>
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <Speech size={14} className="text-[#a9793d]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]">
                Today&apos;s Prompt
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-xl italic leading-snug text-[var(--sh-text-primary)] md:text-2xl`}
            >
              &ldquo;{todaysPrompt()}&rdquo;
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--sh-text-tertiary)]">
              Use it if it lands. Ignore it if it doesn&apos;t.
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
              Private Journal
            </p>
            <h1
              className={`${serif.className} text-5xl font-medium leading-tight md:text-6xl`}
            >
              One honest sentence is enough.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-[var(--sh-text-secondary)]">
              Your journal is private. Encrypted. Yours alone. No one — not even
              Stone Harbor staff — can read what you write here.
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
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                Title
              </label>
              <VentInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-6"
                placeholder="Optional title"
              />

              <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                Mood
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
                      {option.label}
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

              <div className="mb-2 flex items-baseline justify-between gap-3">
                <label className="block text-xs font-bold uppercase tracking-[0.22em] text-[var(--sh-text-secondary)]">
                  Reflection
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
                      ? "Before you write — one breath in your body?"
                      : pendingBodySpots.length === 0
                        ? "Body check complete · adjust"
                        : `Noticed in: ${pendingBodySpots.join(", ")} · adjust`}
                  </button>
                )}
              </div>
              <VentTextarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
                className="mb-2"
                placeholder="What do you need to say today?"
              />
              {/* "Start with one word" — appears only when the textarea
                  has been empty for 12s. The 5-second-rule pattern, in
                  the harbor's voice: not a countdown, not pressure, just
                  permission to begin badly. Fades away the moment he
                  types anything. */}
              {showStartNudge && content.length === 0 && (
                <p className="mb-2 text-[11px] italic leading-relaxed text-[var(--sh-text-tertiary)]">
                  Start with one word. Any word.
                </p>
              )}
              <div className="mb-8 flex items-center justify-between text-xs text-[var(--sh-text-tertiary)]">
                <span>
                  {wordCount === 0
                    ? "Start anywhere. Even half a sentence counts."
                    : wordCount === 1
                      ? "1 word."
                      : `${wordCount} words.`}
                </span>
                <span className="italic">No one reads this but you.</span>
              </div>

              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="group relative w-full overflow-hidden rounded-none border border-[#f4d7a1]/50 bg-[#a9793d] px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.18)] transition duration-300 hover:scale-[1.02] hover:bg-[#8d6432] disabled:opacity-60 disabled:hover:scale-100"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
                <span className="relative z-10">
                  {saving ? "Saving..." : "Save Reflection"}
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
                  Your Entries
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  Showing {filteredAndSortedEntries.length} of {entries.length}
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
                Reset
              </button>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-[1fr_0.55fr]">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  Search Entries
                </label>
                <VentInput
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search title, mood, or content"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)]">
                  Sort By
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
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="mood">Mood A-Z</option>
                  <option value="title">Title A-Z</option>
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
                  Your first entry is the heaviest.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  Then they get lighter. Start with one honest sentence — no one
                  is reading.
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
                No entries match your search.
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
                            {moodLabel(entry.mood)}
                          </span>
                          <h2
                            className={`${serif.className} mt-3 text-3xl font-medium text-[var(--sh-text-primary)]`}
                          >
                            {entry.title || "Untitled Entry"}
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
                                    · edited {formatEntryDateTime(editedAt)}
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
                                Edit
                              </button>
                            )}
                          <button
                            onClick={() => deleteEntry(entry.id)}
                            className="rounded-none border border-[var(--sh-border-medium)] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)] transition hover:border-red-300 hover:text-red-600"
                          >
                            Delete
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
                            placeholder="Title (optional)"
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
                            placeholder="Refine what you wrote…"
                          />
                          <p className="text-xs italic text-[var(--sh-text-muted)]">
                            Your first words (title and body) are preserved. This refines only the rendered version.
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                              onClick={cancelEditingEntry}
                              disabled={savingEdit}
                              className="rounded-none border border-[var(--sh-border-medium)] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[var(--sh-text-tertiary)] transition hover:border-[var(--sh-text-secondary)] hover:text-[var(--sh-text-primary)] disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEditingEntry(entry)}
                              disabled={savingEdit || !editingDraft.trim()}
                              className="rounded-none border border-[var(--sh-accent-gold)] bg-[#a9793d] px-5 py-2 text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
                            >
                              {savingEdit ? "Saving…" : "Save Edit"}
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
                  Your Pattern
                </p>
                <h2
                  className={`${serif.className} mt-2 text-4xl font-medium text-[var(--sh-text-primary)] md:text-5xl`}
                >
                  The last thirty days.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--sh-text-secondary)]">
                  Each square is a day. The color is the mood you named. The
                  blanks are days you didn&apos;t write. No judgment — just
                  data, looking back at you.
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
                      {option.label}
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
                      day.mood ? ` · ${moodLabel(day.mood)}` : " · No entry"
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
        bodyLabel="your journal entry"
      />
    </main>
  );
}
