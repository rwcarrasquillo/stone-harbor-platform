"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";
import { PageTopNav } from "@/app/components/pageTopNav";
import { InactivityGate } from "@/app/components/inactivityGate";

/**
 * Stone Harbor — /map/operating-manual.
 *
 * Reads the caller's generated chapter from eidos_chapters and
 * renders it in Stone Harbor's editorial layout: a soft cover line,
 * the chapter body as flowing prose, and a quiet footer.
 *
 * Phase 1 ships Chapter 1 only. The page detects whether the chapter
 * exists; if not, it points the user back to /map.
 */

type Chapter = {
  chapterNumber: number;
  language: string;
  body: string;
  model?: string;
  generatedAt?: string;
};

const COPY = {
  en: {
    cover: "Operating Manual",
    chapterLabel: "Chapter 1 — How You Are Wired",
    notReady: "Your Operating Manual is not ready yet.",
    notReadyBody:
      "Finish Week 1 of The Map first, then come back. The first chapter will be waiting.",
    back: "Back to the map",
    dashBack: "Dashboard",
    dashEyebrow: "Return To Harbor",
    brand: "Stone Harbor",
    footer:
      "This document is for you. Re-read it on the days that ask for it.",
    // Shown when a chapter exists in the OTHER language but not this one.
    // Stone Harbor is bilingual — newer members get both at Map completion,
    // but older members may have only one language and need a backfill.
    onlyOtherLang:
      "Your Operating Manual was written in Spanish. You can generate the English version from the same Map session — it takes about 20 seconds.",
    generateInThis: "Generate in English",
    generating: "Writing your manual…",
    generateFailed:
      "Something went wrong generating your manual. Please try again, or come back later.",
  },
  es: {
    cover: "Manual de Operación",
    chapterLabel: "Capítulo 1 — Cómo estás construido",
    notReady: "Tu Manual de Operación no está listo todavía.",
    notReadyBody:
      "Termina la Semana 1 de El Mapa primero, y vuelve. El primer capítulo te estará esperando.",
    back: "Volver al mapa",
    dashBack: "Panel",
    dashEyebrow: "Volver Al Puerto",
    brand: "Stone Harbor",
    footer:
      "Este documento es para ti. Reléelo los días que lo pidan.",
    onlyOtherLang:
      "Tu Manual de Operación se escribió en inglés. Puedes generar la versión en español desde la misma sesión del Mapa — toma unos 20 segundos.",
    generateInThis: "Generar en español",
    generating: "Escribiendo tu manual…",
    generateFailed:
      "Algo salió mal al generar tu manual. Vuelve a intentarlo, o regresa más tarde.",
  },
};

export default function OperatingManualPage() {
  // Defensive fallback to "en" in case useLocale() returns an empty
  // value during a hydration edge — without it the back link URLs
  // could render as "//map" and produce a 404 ("Not part of the
  // harbor") on the first click after mount.
  const rawLocale = useLocale();
  const locale = (rawLocale === "es" ? "es" : "en") as "en" | "es";
  const t = COPY[locale];
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  // True when the member has a chapter in the OTHER language but not
  // this one. Drives the "Generate in {language}" affordance below.
  const [otherLangExists, setOtherLangExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  async function load() {
    setLoading(true);
    setOtherLangExists(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Fetch ALL chapter rows for this member so we know whether the
      // requested locale exists, the other one exists, or neither.
      // RLS on eidos_chapters restricts to the caller's rows; safe to
      // read directly from the client.
      const { data } = await supabase
        .from("eidos_chapters")
        .select("chapter_number, language, body, model, generated_at")
        .eq("chapter_number", 1);

      const rows = data ?? [];
      const mine = rows.find((r) => r.language === locale);
      const other = rows.find((r) => r.language !== locale);

      if (mine) {
        setChapter({
          chapterNumber: mine.chapter_number,
          language: mine.language,
          body: mine.body,
          model: mine.model ?? undefined,
          generatedAt: mine.generated_at ?? undefined,
        });
      } else if (other) {
        // The "missing-language" path. Member has a chapter, just not
        // in the language they're currently reading the app in. Show
        // the "Generate in {language}" affordance below.
        setOtherLangExists(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // Generate the chapter in the current locale. Used by the missing-
  // language affordance when the member has a chapter in the OTHER
  // language. Same Map session data; the engine localizes the prompt.
  async function generateInThisLocale() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const resp = await fetch("/api/map/generate-chapter", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterNumber: 1, languages: [locale] }),
      });
      if (!resp.ok) {
        setGenerateError(t.generateFailed);
        return;
      }
      // Reload so the page flips from the missing-language affordance
      // to the chapter view.
      await load();
    } catch {
      setGenerateError(t.generateFailed);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      {/* InactivityGate added 2026-05-31 — reading one's own Operating
          Manual on a shared device shouldn't keep the session open
          indefinitely. Parity with every other authenticated page. */}
      <InactivityGate />
      <PageAmbience />
      {/* Canonical TOP NAV — same shared component used across every
          text-link page, with localized labels passed through. */}
      <PageTopNav
        backHref={`/${locale}/dashboard`}
        backLabel={t.dashBack}
        backEyebrow={t.dashEyebrow}
        wordmark={t.brand}
        wordmarkHref={`/${locale}`}
      />

      <section className="relative z-10 mx-auto max-w-2xl px-5 pb-12 md:px-8 md:pb-20">
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
          {t.cover}
        </p>

        {loading ? (
          <p className="mt-10 text-stone-400">…</p>
        ) : chapter ? (
          <>
            <h1 className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-100 md:text-4xl">
              {t.chapterLabel}
            </h1>

            <div className="mt-10 h-px w-16 bg-[#c4934e]" />

            {/* Chapter body — preserve paragraph breaks from the
                generator output. Cormorant-Garamond serif for warmth;
                the chapter is meant to be read, not skimmed. */}
            <article className="mt-10 space-y-6 font-serif text-base leading-[1.7] text-stone-200 md:text-lg">
              {chapter.body
                .split(/\n\s*\n/)
                .map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
            </article>

            <div className="mt-16 h-px w-16 bg-stone-700" />

            <p className="mt-6 text-sm italic leading-relaxed text-stone-500 md:text-base">
              {t.footer}
            </p>
          </>
        ) : otherLangExists ? (
          // Missing-language branch — chapter exists in the other
          // language but not this one. Member can backfill with a
          // single click; the Map session data is reused, only the
          // localized prompt + AI call run.
          <>
            <h1 className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-100 md:text-4xl">
              {t.notReady}
            </h1>
            <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
              {t.onlyOtherLang}
            </p>
            <button
              type="button"
              onClick={generateInThisLocale}
              disabled={generating}
              className="mt-10 inline-block rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:opacity-60"
            >
              {generating ? t.generating : t.generateInThis}
            </button>
            {generateError && (
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-red-400">
                {generateError}
              </p>
            )}
            <div className="mt-8">
              <Link
                href={`/${locale}/map`}
                className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400 transition hover:text-[#c4934e]"
              >
                ← {t.back}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-100 md:text-4xl">
              {t.notReady}
            </h1>
            <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
              {t.notReadyBody}
            </p>
            {/* Converted from <a> to <Link> (2026-05-31) so navigation
                routes through the Next.js client router rather than
                doing a full page reload. The full-reload path was
                intermittently producing a 404 when the route
                interpolation happened to evaluate to "//map". */}
            <Link
              href={`/${locale}/map`}
              className="mt-10 inline-block rounded-none border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black"
            >
              ← {t.back}
            </Link>
          </>
        )}

        {chapter && (
          <div className="mt-12">
            <Link
              href={`/${locale}/map`}
              className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400 transition hover:text-[#c4934e]"
            >
              ← {t.back}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
