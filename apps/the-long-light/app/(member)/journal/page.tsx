/**
 * /journal — private daily writing (skeleton).
 *
 * Structure only: a mood selector row, a large writing field, and a
 * 30-day history strip. None of it is wired to state or the database —
 * the mood pills are visual-only, the textarea doesn't save, and the
 * strip is 30 inert cells with no color encoding yet. Color meaning and
 * all voice land in later phases after editorial review.
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DraftPlaceholder } from "@/app/components/draftPlaceholder";

const MOODS = [
  "Spacious",
  "Tender",
  "Tired (in a good way)",
  "Tired (in a hard way)",
  "Bright",
  "Folded inward",
];

export default async function JournalPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-[680px] px-6 py-10">
      <h1 className="font-serif text-3xl text-[var(--primary)] md:text-4xl">
        Your journal.
      </h1>

      {/* Mood selector */}
      <section className="mt-8">
        <DraftPlaceholder note="The mood vocabulary is placeholder. Final words — how many, what they're called, the order — are editorial. Visual-only here; nothing is selectable yet.">
          How is tonight sitting with you?
        </DraftPlaceholder>
        <div className="mt-3 flex flex-wrap gap-2">
          {MOODS.map((mood) => (
            <span
              key={mood}
              className="rounded-full border border-[var(--secondary)]/60 bg-[var(--background-recessed)] px-3 py-1.5 font-sans text-sm text-[var(--text-secondary)]"
            >
              {mood}
            </span>
          ))}
        </div>
      </section>

      {/* Writing field */}
      <section className="mt-8">
        <DraftPlaceholder note="A short voice prompt sits above the writing field — to be authored editorially.">
          The page is yours. No one reads this but you.
        </DraftPlaceholder>
        <div className="mt-3 rounded-sm border border-[var(--accent-base)]/40 bg-[var(--background-recessed)] p-4">
          <textarea
            placeholder="[journal writing field — voice prompt above the field TBD editorially]"
            rows={10}
            className="w-full resize-none bg-transparent font-sans leading-relaxed text-[var(--text-primary)] placeholder:italic placeholder:text-[var(--text-secondary)]/60 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="font-sans text-xs text-[var(--text-secondary)]/70">
              Entry saving wires up in Phase 4.
            </p>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-sm bg-[var(--primary)] px-4 py-2 font-sans text-sm text-[var(--background-base)] opacity-50"
            >
              Save entry
            </button>
          </div>
        </div>
      </section>

      {/* 30-day strip */}
      <section className="mt-10">
        <h2 className="font-serif text-xl text-[var(--primary)]">
          The last thirty days
        </h2>
        <div className="mt-3">
          <DraftPlaceholder note="A 30-day rhythm strip. Whether and how each day is color-encoded (by mood, by whether you wrote, by something else) is TBD. Cells are inert and uncolored for now.">
            A quiet record of which days you came here.
          </DraftPlaceholder>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="h-7 w-7 rounded-sm border border-[var(--background-recessed)] bg-[var(--background-recessed)]"
              aria-hidden="true"
            />
          ))}
        </div>
      </section>
    </main>
  );
}
