"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Cormorant_Garamond, Inter } from "next/font/google";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type JournalEntry = {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  created_at: string;
};

type SortOption = "newest" | "oldest" | "mood" | "title";

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

  useEffect(() => {
    loadJournal();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f3efe7] text-stone-700">
        <p className="text-sm font-bold uppercase tracking-[0.3em]">
          Loading Journal...
        </p>
      </main>
    );
  }

  return (
    <main
      className={`${sans.className} relative min-h-screen bg-[#f3efe7] px-6 py-12 text-stone-900`}
    >
      <audio ref={audioRef} src="/shimmering-breeze.mp3" preload="auto" />

      <button
        onClick={toggleSound}
        className="fixed bottom-8 right-8 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/30 text-stone-800 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-2xl transition duration-300 hover:scale-110 hover:bg-white/45"
        aria-label={soundOn ? "Mute Nature Sounds" : "Play Nature Sounds"}
      >
        {soundOn ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M14.5 3.5a1 1 0 0 1 1.7.7v15.6a1 1 0 0 1-1.7.7L9.2 16H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4.2l5.3-4.5ZM18.4 8.2a1 1 0 0 1 1.4 0 5.5 5.5 0 0 1 0 7.8 1 1 0 0 1-1.4-1.4 3.5 3.5 0 0 0 0-5 1 1 0 0 1 0-1.4Zm-2.6 2.6a1 1 0 0 1 1.4 0 1.8 1.8 0 0 1 0 2.4 1 1 0 0 1-1.4-1.4.2.2 0 0 0 0-.3 1 1 0 0 1 0-1.4Z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M14.5 3.5a1 1 0 0 1 1.7.7v15.6a1 1 0 0 1-1.7.7L9.2 16H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4.2l5.3-4.5ZM18.3 9.7l-1.6 1.6-1.6-1.6a1 1 0 1 0-1.4 1.4l1.6 1.6-1.6 1.6a1 1 0 1 0 1.4 1.4l1.6-1.6 1.6 1.6a1 1 0 0 0 1.4-1.4l-1.6-1.6 1.6-1.6a1 1 0 1 0-1.4-1.4Z" />
          </svg>
        )}
      </button>

      <section className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="/dashboard"
            className="text-sm font-bold uppercase tracking-[0.3em] text-[#a9793d]"
          >
            ← Dashboard
          </a>

          <a
            href="/"
            className="text-sm font-bold uppercase tracking-[0.3em] text-stone-500"
          >
            Stone Harbor
          </a>
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[3rem] border border-white/50 bg-white/75 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)] backdrop-blur-2xl md:p-12">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
              Private Journal
            </p>

            <h1
              className={`${serif.className} text-5xl font-medium leading-tight md:text-7xl`}
            >
              Write what you cannot carry alone.
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-stone-600">
              Your journal is private. Only you can view your entries.
            </p>

            <form onSubmit={saveEntry} className="mt-10">
              <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
                Title
              </label>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mb-6 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
                placeholder="Optional title"
              />

              <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
                Mood
              </label>

              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="mb-6 w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
              >
                <option value="grounded">Grounded</option>
                <option value="confused">Confused</option>
                <option value="angry">Angry</option>
                <option value="sad">Sad</option>
                <option value="hopeful">Hopeful</option>
                <option value="strong">Strong</option>
              </select>

              <label className="mb-2 block text-sm font-bold uppercase tracking-[0.2em] text-stone-600">
                Reflection
              </label>

              <textarea
                required
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={9}
                className="mb-8 w-full resize-none rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
                placeholder="What do you need to say today?"
              />

              <button
                type="submit"
                disabled={saving}
                className="group relative w-full overflow-hidden rounded-full border border-[#f4d7a1]/50 bg-[#a9793d]/70 px-8 py-5 text-sm font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_35px_rgba(0,0,0,0.18)] backdrop-blur-2xl transition duration-300 hover:scale-[1.02] hover:bg-[#8d6432]/80 disabled:opacity-60"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[#f4d7a1]/35 via-white/10 to-transparent opacity-80" />
                <span className="relative z-10">
                  {saving ? "Saving..." : "Save Journal Entry"}
                </span>
              </button>
            </form>
          </div>

          <div className="rounded-[3rem] border border-white/50 bg-white/60 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.06)] backdrop-blur-2xl md:p-10">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-3 text-sm font-bold uppercase tracking-[0.35em] text-[#a9793d]">
                  Your Entries
                </p>

                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Showing {filteredAndSortedEntries.length} of {entries.length}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setSortOption("newest");
                }}
                className="w-fit rounded-full border border-stone-300 bg-white/60 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-600 transition hover:border-[#a9793d] hover:bg-white"
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
                  className="w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
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
                  className="w-full rounded-2xl border border-stone-300 bg-[#f8f4ed] px-5 py-4 outline-none transition focus:border-[#a9793d]"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="mood">Mood A-Z</option>
                  <option value="title">Title A-Z</option>
                </select>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-[2rem] bg-[#f8f4ed] p-8 text-stone-600">
                No journal entries yet. Start with one honest sentence.
              </div>
            ) : filteredAndSortedEntries.length === 0 ? (
              <div className="rounded-[2rem] bg-[#f8f4ed] p-8 text-stone-600">
                No entries match your search.
              </div>
            ) : (
              <div className="space-y-5">
                {filteredAndSortedEntries.map((entry) => (
                  <article
                    key={entry.id}
                    className="rounded-[2rem] border border-stone-200 bg-[#f8f4ed] p-6"
                  >
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#a9793d]">
                          {entry.mood || "Reflection"}
                        </p>

                        <h2
                          className={`${serif.className} mt-2 text-3xl font-medium text-stone-900`}
                        >
                          {entry.title || "Untitled Entry"}
                        </h2>

                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                          {formatEntryDateTime(entry.created_at)}
                        </p>
                      </div>

                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="rounded-full border border-stone-300 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-500 transition hover:border-red-300 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>

                    <p className="whitespace-pre-wrap leading-relaxed text-stone-700">
                      {entry.content}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
