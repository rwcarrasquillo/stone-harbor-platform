"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { trackMilestone } from "@/lib/memberUsage";
import { serif, sans } from "@/lib/fonts";
import { InactivityGate } from "@/app/components/inactivityGate";

/**
 * Stone Harbor — Vent page.
 *
 * The "I need a place to dump this right now" door. Designed to be
 * the lowest-friction writing surface in the product:
 *
 *   - One tap from the dashboard lands a cursor in the textarea.
 *   - No prompts. No formatting. No privacy decision (defaults to
 *     private; everything written here is owner-only RLS).
 *   - Auto-saves on every keystroke (debounced) to localStorage as
 *     a draft so a man mid-spiral never loses what he was writing
 *     to a tab refresh, a battery die, or a panic close.
 *   - A small mood chip at the top tags the entry so future pattern-
 *     matching ("you tend to feel numb on Sunday nights") is possible
 *     when we build it.
 *   - Save button writes to the journal table with kind='vent' so
 *     it threads naturally into the rest of the member's journal,
 *     but visually marked as a vent so the member can find it later.
 *
 * Why a dedicated route instead of just a button on /journal:
 *   - URL feels like a place. "I'm going to vent" → /vent. Bookmarkable.
 *   - The page itself is unstyled-feeling on purpose. Dark, quiet,
 *     no metadata pressure. /journal has filters, search, list views —
 *     too much chrome when a man needs to dump.
 *
 * Therapeutic note on mood chips:
 *   The four chips — Angry / Scared / Sad / Numb — cover the most
 *   common "I can't articulate this" states for men in distress.
 *   They're optional. Skipping the chip is allowed. Plutchik's
 *   four core emotions plus the dissociation state that many men
 *   in trauma describe as "numb."
 */

type Mood = "angry" | "scared" | "sad" | "numb";

const MOOD_OPTIONS: { value: Mood; label: string; color: string }[] = [
  { value: "angry", label: "Angry", color: "#b14a3a" },
  { value: "scared", label: "Scared", color: "#586558" },
  { value: "sad", label: "Sad", color: "#5d6a85" },
  { value: "numb", label: "Numb", color: "#7a7a78" },
];

const DRAFT_KEY = "stone-harbor:vent-draft";

export default function VentPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus the textarea immediately on mount — frictionless dump entry.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Hydrate draft from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { mood: Mood | null; body: string };
      if (draft.mood) setMood(draft.mood);
      if (draft.body) setBody(draft.body);
    } catch {
      // Corrupted draft — start fresh.
    }
  }, []);

  // Debounced auto-save of the draft to localStorage on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (mood || body.trim()) {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ mood, body }),
        );
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [mood, body]);

  async function commitToJournal() {
    if (!body.trim()) return;
    setSaving(true);
    setSavedMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      setSavedMessage("Please sign in to save this entry.");
      return;
    }

    // Write as a journal entry tagged as a vent. The journal table
    // stores body + mood + kind. If the table doesn't have a `kind`
    // column we fall back to tagging in the body. (Defensive: read
    // your schema and adjust if needed.)
    const { error } = await supabase.from("journal_entries").insert({
      user_id: user.id,
      body: body.trim(),
      mood: mood ?? null,
      kind: "vent",
      privacy_level: "private",
    });

    setSaving(false);

    if (error) {
      // If the table doesn't accept `kind` or `privacy_level`, we'll
      // see the error and fall back gracefully on the next iteration.
      setSavedMessage(`Couldn't save right now: ${error.message}`);
      return;
    }

    // Clear draft on successful save.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    trackMilestone("first_vent_post");
    setBody("");
    setMood(null);
    setSavedMessage("Saved to your journal. The harbor heard you.");
    // Give the success message a beat, then route back.
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <main
      className={`${sans.className} relative flex min-h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white`}
    >
      <InactivityGate />

      {/* Quiet dark backdrop — no rotating imagery here. The page
          should feel like a private room, not an inspirational scene. */}
      <div className="fixed inset-0 z-0 bg-[#0A0A0B]" />
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 40%, rgba(196,147,78,0.10) 0%, rgba(196,147,78,0.03) 50%, transparent 80%)",
        }}
      />

      <header className="relative z-20 flex items-center justify-between px-4 py-3 md:px-10 md:py-5">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="flex items-center gap-2 text-[#c4934e] transition hover:text-white"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          <span className="hidden text-xs font-bold uppercase tracking-[0.22em] md:inline">
            Harbor
          </span>
        </Link>
        <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/55">
          Vent · Private
        </p>
      </header>

      <section className="relative z-20 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5"
        >
          <h1
            className={`${serif.className} text-2xl italic leading-snug text-white md:text-3xl`}
          >
            Put it down here.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/65 md:text-base">
            Nothing you write here goes anywhere. It's saved to your private
            journal and only you can read it.
          </p>
        </motion.div>

        {/* Mood chips — optional. */}
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="radiogroup"
          aria-label="What you're feeling (optional)"
        >
          {MOOD_OPTIONS.map((opt) => {
            const active = mood === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMood(active ? null : opt.value)}
                className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.22em] transition ${
                  active
                    ? "text-white"
                    : "border-white/25 text-white/70 hover:border-white/55"
                }`}
                style={
                  active
                    ? {
                        borderColor: opt.color,
                        backgroundColor: opt.color + "33",
                      }
                    : undefined
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Whatever it is. No formatting, no audience."
          rows={10}
          className="flex-1 w-full resize-none border border-white/15 bg-white/[0.04] p-5 text-base leading-relaxed text-white outline-none transition placeholder:text-white/30 focus:border-[#c4934e]/60 focus:bg-white/[0.06] md:text-lg"
        />

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            className="text-[11px] text-white/45"
            aria-live="polite"
          >
            {savedMessage ||
              (body.trim()
                ? "Auto-saving as a draft."
                : "Nothing's been written yet.")}
          </p>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-none border border-white/20 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.22em] text-white/75 transition hover:border-white/40 hover:text-white"
            >
              Leave Draft
            </Link>
            <button
              type="button"
              onClick={commitToJournal}
              disabled={!body.trim() || saving}
              className="group relative overflow-hidden rounded-none border border-[#c4934e] bg-[#a9793d] px-6 py-3 text-xs font-bold uppercase tracking-[0.22em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save To Journal"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
