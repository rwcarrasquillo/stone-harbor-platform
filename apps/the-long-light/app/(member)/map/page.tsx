/**
 * /map — "The Map" (your operating manual), skeleton.
 *
 * Structure only: a chapter list (a sidebar on desktop, a stacked
 * accordion-style list on mobile) and a reading pane showing the first
 * chapter's sections. Chapter names are SH-derived placeholders; the
 * Long Light's chapter set and every word of the body are TBD and
 * AI-generated downstream, so everything is wrapped in DraftPlaceholder.
 *
 * Kept as a static server component on purpose — no selection state
 * yet. Chapter 1 is shown expanded; the rest are collapsed headers so
 * the shape of "a multi-chapter manual" reads clearly.
 */

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DraftPlaceholder } from "@/app/components/draftPlaceholder";

const CHAPTERS = [
  "Your foundation",
  "What you tend toward",
  "Where the friction lives",
  "Threshold",
];

const SECTION_LOREM = [
  "Placeholder section copy. A few sentences describing this facet of how she's built — drawn from what she's written, reflected back without judgment. Real text is AI-generated and editorially reviewed.",
  "Placeholder section copy. The voice here is warm, specific, and never clinical. Length and structure are illustrative only.",
  "Placeholder section copy. This third movement closes the chapter with something forward-looking and kind. Final wording TBD.",
];

export default async function MapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="font-serif text-3xl text-[var(--primary)] md:text-4xl">
        The Map.
      </h1>

      <div className="mt-3 max-w-2xl">
        <DraftPlaceholder note="Intro paragraph that frames what The Map is and how it's built from her writing. Voice TBD editorially.">
          A living portrait of how you&apos;re put together — gathered slowly
          from what you write, and handed back to you in chapters.
        </DraftPlaceholder>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
        {/* Chapter list — sidebar on desktop, stacked on mobile */}
        <nav aria-label="Chapters" className="space-y-2">
          <p className="font-sans text-xs uppercase tracking-wide text-[var(--text-secondary)]/70">
            Chapters
          </p>
          <ul className="space-y-1.5">
            {CHAPTERS.map((chapter, i) => {
              const active = i === 0;
              return (
                <li key={chapter}>
                  <div
                    className={`flex items-center gap-2 rounded-sm border-l-2 px-3 py-2 font-sans text-sm ${
                      active
                        ? "border-[var(--accent-long-light)] bg-[var(--background-recessed)] text-[var(--primary)]"
                        : "border-transparent text-[var(--text-secondary)]"
                    }`}
                  >
                    <span className="text-xs text-[var(--text-secondary)]/60">
                      {i + 1}
                    </span>
                    <span className="italic">{chapter}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="px-3 pt-1 text-xs not-italic text-[var(--text-secondary)]/60">
            [ draft ] — chapter names are placeholders; the Long Light set is
            TBD.
          </p>
        </nav>

        {/* Reading pane — chapter 1 */}
        <article>
          <DraftPlaceholder note="The whole chapter body is AI-generated from her writing and editorially reviewed. This shows three placeholder sections to convey the shape of a chapter.">
            <h2 className="font-serif text-2xl not-italic text-[var(--primary)]">
              1 · Your foundation
            </h2>
          </DraftPlaceholder>

          <div className="mt-5 space-y-6">
            {SECTION_LOREM.map((body, i) => (
              <section key={i}>
                <DraftPlaceholder
                  note={
                    i === 0
                      ? "Each chapter is composed of a few short sections like this one."
                      : undefined
                  }
                >
                  <h3 className="font-serif text-lg not-italic text-[var(--primary)]">
                    Section {i + 1} — placeholder heading
                  </h3>
                  <p className="mt-2 leading-relaxed">{body}</p>
                </DraftPlaceholder>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
