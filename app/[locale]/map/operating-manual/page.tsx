"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";

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
    footer:
      "This document is for you. Re-read it on the days that ask for it.",
  },
  es: {
    cover: "Manual de Operación",
    chapterLabel: "Capítulo 1 — Cómo estás construido",
    notReady: "Tu Manual de Operación no está listo todavía.",
    notReadyBody:
      "Termina la Semana 1 de El Mapa primero, y vuelve. El primer capítulo te estará esperando.",
    back: "Volver al mapa",
    footer:
      "Este documento es para ti. Reléelo los días que lo pidan.",
  },
};

export default function OperatingManualPage() {
  const locale = useLocale() as "en" | "es";
  const t = COPY[locale];
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  async function load() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // We don't expose a dedicated chapter-fetch endpoint yet —
      // pull straight via the Supabase JS client. RLS on
      // eidos_chapters restricts to the caller's rows, so this is
      // safe to read from the client.
      const { data } = await supabase
        .from("eidos_chapters")
        .select("chapter_number, language, body, model, generated_at")
        .eq("chapter_number", 1)
        .eq("language", locale)
        .maybeSingle();

      if (data) {
        setChapter({
          chapterNumber: data.chapter_number,
          language: data.language,
          body: data.body,
          model: data.model ?? undefined,
          generatedAt: data.generated_at ?? undefined,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      <PageAmbience />
      <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-32">
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
        ) : (
          <>
            <h1 className="mt-3 font-serif text-3xl font-medium leading-tight text-stone-100 md:text-4xl">
              {t.notReady}
            </h1>
            <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
              {t.notReadyBody}
            </p>
            <a
              href={`/${locale}/map`}
              className="mt-10 inline-block rounded-none border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black"
            >
              ← {t.back}
            </a>
          </>
        )}

        {chapter && (
          <div className="mt-12">
            <a
              href={`/${locale}/map`}
              className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400 transition hover:text-[#c4934e]"
            >
              ← {t.back}
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
