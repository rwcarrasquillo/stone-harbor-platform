"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";
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

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
  content: string;
  mood: string | null;
  created_at: string;
};

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("grounded");
  const [content, setContent] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
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
    const { data: gateRow } = await supabase
      .from("profiles")
      .select("suspended_at")
      .eq("id", user.id)
      .single();
    if (gateRow?.suspended_at) {
      window.location.href = "/suspended";
      return;
    }
    setUserId(user.id);
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, title, content, mood, created_at")
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
    const { error } = await supabase.from("journal_entries").insert({
      user_id: userId,
      title: title.trim() || null,
      mood,
      content: content.trim(),
    });
    if (!error) {
      setTitle("");
      setMood("grounded");
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
        className={`${sans.className} flex min-h-screen items-center justify-center bg-[#f3efe7]`}
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
            className={`${serif.className} mt-8 text-2xl italic text-stone-700`}
          >
            Opening your journal…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-hidden bg-[#f3efe7] text-stone-900`}
    >
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      {/* AMBIENT — contour pattern */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.035]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="journal-contour"
            x="0"
            y="0"
            width="320"
            height="320"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 60 Q 80 30 160 60 T 320 60"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 130 Q 80 100 160 130 T 320 130"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 200 Q 80 170 160 200 T 320 200"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
            <path
              d="M0 270 Q 80 240 160 270 T 320 270"
              fill="none"
              stroke="#a9793d"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#journal-contour)" />
      </svg>

      {/* AMBIENT — paper grain */}
      <svg
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.05] mix-blend-multiply"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="journal-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#journal-grain)" />
      </svg>

      {/* AMBIENT — dawn glow upper-right */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 88% 8%, rgba(196,147,78,0.18) 0%, rgba(196,147,78,0.06) 40%, transparent 75%)",
        }}
      />

      {/* SOUND TOGGLE */}
      <button
        onClick={toggleSound}
        className="fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-none border border-white/40 bg-white/30 text-stone-800 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-2xl transition duration-300 hover:scale-110 hover:bg-white/45"
        aria-label={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
        title={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
      >
        {soundOn ? <SoundOn size={16} /> : <SoundOff size={16} />}
      </button>

      <section className="relative z-10 mx-auto max-w-7xl px-6 py-10 md:px-8">
        {/* TOP NAV */}
        <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/dashboard"
            className="group flex flex-col leading-none no-underline"
          >
            <span className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d] transition group-hover:text-[#8d6432]">
              ← Dashboard
            </span>
            <span className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Return To Harbor
            </span>
          </a>
          <a
            href="/"
            className="text-xs font-bold uppercase tracking-[0.28em] text-stone-500 transition hover:text-[#a9793d]"
          >
            Stone Harbor
          </a>
        </div>

        {/* GREETING STRIP — streak + prompt + privacy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 grid gap-6 border-y border-stone-200 bg-white/40 px-6 py-7 backdrop-blur-sm md:grid-cols-4"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
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
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
                Writing Streak
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-2xl italic text-stone-900`}
            >
              {streak === 0
                ? "Begin today."
                : streak === 1
                  ? "Day 1."
                  : `Day ${streak}.`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-stone-500">
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
              <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-stone-500">
                Today&apos;s Prompt
              </p>
            </div>
            <p
              className={`${serif.className} mt-2 text-xl italic leading-snug text-stone-900 md:text-2xl`}
            >
              &ldquo;{todaysPrompt()}&rdquo;
            </p>
            <p className="mt-2 text-xs leading-relaxed text-stone-500">
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
            className="rounded-none border border-white/50 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-12"
          >
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Private Journal
            </p>
            <h1
              className={`${serif.className} text-5xl font-medium leading-tight md:text-6xl`}
            >
              One honest sentence is enough.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-stone-600">
              Your journal is private. Encrypted. Yours alone. No one — not even
              Stone Harbor staff — can read what you write here.
            </p>

            <form onSubmit={saveEntry} className="mt-10">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-stone-600">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-6 w-full rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                placeholder="Optional title"
              />

              <label className="mb-3 block text-xs font-bold uppercase tracking-[0.22em] text-stone-600">
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
                      onClick={() => setMood(option.value)}
                      className="flex items-center gap-2 border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.22em] transition"
                      style={{
                        borderColor: active ? option.color : "#d6d3d1",
                        color: active ? option.color : "#57534e",
                        backgroundColor: active ? "#ffffff" : "#f8f4ed",
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

              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-stone-600">
                Reflection
              </label>
              <textarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
                className="mb-2 w-full resize-none rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                placeholder="What do you need to say today?"
              />
              <div className="mb-8 flex items-center justify-between text-xs text-stone-500">
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
            className="rounded-none border border-white/50 bg-white/60 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.06)] backdrop-blur-2xl md:p-10"
          >
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[#a9793d]">
                  Your Entries
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Showing {filteredAndSortedEntries.length} of {entries.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSortOption("newest");
                }}
                className="w-fit rounded-none border border-stone-300 bg-white/60 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-600 transition hover:border-[#a9793d] hover:bg-white"
              >
                Reset
              </button>
            </div>

            <div className="mb-6 grid gap-4 md:grid-cols-[1fr_0.55fr]">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
                  Search Entries
                </label>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d] focus:ring-2 focus:ring-[#586558]/30"
                  placeholder="Search title, mood, or content"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
                  Sort By
                </label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="w-full rounded-none border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="mood">Mood A-Z</option>
                  <option value="title">Title A-Z</option>
                </select>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-none border border-stone-200 bg-[#f8f4ed] p-8">
                <p
                  className={`${serif.className} text-3xl italic text-stone-700`}
                >
                  Your first entry is the heaviest.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-stone-600">
                  Then they get lighter. Start with one honest sentence — no one
                  is reading.
                </p>
              </div>
            ) : filteredAndSortedEntries.length === 0 ? (
              <div className="rounded-none border border-stone-200 bg-[#f8f4ed] p-8 text-stone-600">
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
                      className="rounded-none border border-stone-200 bg-[#f8f4ed] p-6 transition hover:border-[#a9793d]/40"
                      style={{ borderLeft: `3px solid ${color}` }}
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <span
                            className="inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]"
                            style={{
                              borderColor: color,
                              color,
                              backgroundColor: "white",
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
                            className={`${serif.className} mt-3 text-3xl font-medium text-stone-900`}
                          >
                            {entry.title || "Untitled Entry"}
                          </h2>
                          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                            {formatEntryDateTime(entry.created_at)}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteEntry(entry.id)}
                          className="rounded-none border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-500 transition hover:border-red-300 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed text-stone-700">
                        {entry.content}
                      </p>
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
            className="mt-10 rounded-none border border-stone-200 bg-white/70 p-8 backdrop-blur-sm"
          >
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#a9793d]">
                  Your Pattern
                </p>
                <h2
                  className={`${serif.className} mt-2 text-4xl font-medium text-stone-900 md:text-5xl`}
                >
                  The last thirty days.
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
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
                      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500"
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

      {/* FOOTER — 988 crisis line, required on every authenticated screen */}
      <footer className="relative z-10 mt-12 border-t border-stone-200 bg-[#efe8dc]/70 px-6 py-10 backdrop-blur-sm">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3 md:items-center">
          <div>
            <p className="text-base font-bold uppercase tracking-[0.28em] text-[#a9793d]">
              Stone Harbor
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a9793d]/70">
              Men&apos;s Mental Wellness
            </p>
          </div>
          <div className="text-center">
            <p className={`${serif.className} text-base italic text-stone-600`}>
              The harbor is patient.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-500">
              If You Are In Crisis
            </p>
            <p className="mt-2 text-sm leading-relaxed text-stone-700">
              Call or text <span className="font-bold text-[#a9793d]">988</span>{" "}
              — 24/7. Free. Confidential.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
