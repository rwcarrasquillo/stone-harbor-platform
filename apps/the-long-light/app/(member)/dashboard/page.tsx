/**
 * /dashboard — the member's home surface (skeleton).
 *
 * Shape only. Every line of copy here is placeholder scaffolding wrapped
 * in <DraftPlaceholder>; the editorial cofounder owns the actual voice.
 * The reflection textarea renders but does not save — functional saves
 * land in Phase 4 after editorial review.
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DraftPlaceholder } from "@/app/components/draftPlaceholder";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-[640px] px-6 py-10">
      <h1 className="font-serif text-3xl text-[var(--primary)] md:text-4xl">
        Welcome.
      </h1>

      <div className="mt-3">
        <DraftPlaceholder note="A short daily reflection prompt rotates here. Voice + cadence to be authored editorially.">
          Today&apos;s reflection prompt — a single gentle question to sit
          with, to be authored editorially.
        </DraftPlaceholder>
      </div>

      {/* Reflection card */}
      <section className="mt-8">
        <DraftPlaceholder note="The framing line above the field is editorial copy, TBD.">
          A place to answer today&apos;s prompt — or to write nothing at all.
        </DraftPlaceholder>
        <div className="mt-3 rounded-sm border border-[var(--accent-base)]/40 bg-[var(--background-recessed)] p-4">
          <textarea
            placeholder="[reflection field — editorial copy TBD]"
            rows={4}
            className="w-full resize-none bg-transparent font-sans text-[var(--text-primary)] placeholder:italic placeholder:text-[var(--text-secondary)]/60 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <p className="font-sans text-xs text-[var(--text-secondary)]/70">
              Reflection saving wires up in Phase 4.
            </p>
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-sm bg-[var(--primary)] px-4 py-2 font-sans text-sm text-[var(--background-base)] opacity-50"
            >
              Save reflection
            </button>
          </div>
        </div>
      </section>

      {/* Ripples — member feed */}
      <section className="mt-10">
        <h2 className="font-serif text-xl text-[var(--primary)]">Ripples</h2>
        <div className="mt-3">
          <DraftPlaceholder note="The shared/community surface. Whether this is a quiet ambient feed (Hearth), a small group (Circle), or a fuller space (Table) is an open product question — TBD with editorial + product.">
            A gentle, low-pressure trace of others moving through their own
            long chapters. Tone, visibility, and shape all to be decided.
          </DraftPlaceholder>
        </div>
      </section>

      {/* Three doors */}
      <section className="mt-10">
        <h2 className="font-serif text-xl text-[var(--primary)]">
          Where you can go
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <DraftPlaceholder note="Links to /journal.">
            <span className="font-serif text-base not-italic text-[var(--primary)]">
              The Journal
            </span>
            <p className="mt-1">Private writing, day by day — door copy TBD.</p>
          </DraftPlaceholder>
          <DraftPlaceholder note="Links to /map.">
            <span className="font-serif text-base not-italic text-[var(--primary)]">
              The Map
            </span>
            <p className="mt-1">Your operating manual — door copy TBD.</p>
          </DraftPlaceholder>
          <DraftPlaceholder note="Links to /resources.">
            <span className="font-serif text-base not-italic text-[var(--primary)]">
              Resources
            </span>
            <p className="mt-1">Support for the hard nights — door copy TBD.</p>
          </DraftPlaceholder>
        </div>
      </section>
    </main>
  );
}
