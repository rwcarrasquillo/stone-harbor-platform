"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";
import { LanguagePicker } from "@/app/components/languagePicker";

/**
 * Stone Harbor — /map hub.
 *
 * The Map's home. Depending on the caller's state:
 *   • No session → "Begin your map" card.
 *   • In progress → "Continue where you left off" card with the
 *     current module and a resume link.
 *   • Complete + chapter 1 generated → "Your Operating Manual" card
 *     with a link to read it.
 *   • Complete + chapter not yet generated → "Assemble Chapter 1"
 *     CTA that fires generate-chapter.
 *
 * Aesthetic: PageAmbience backdrop, restrained typography, Stone
 * Harbor voice. The Map is meant to feel like a slow opening — never
 * a streak counter, never percentages.
 */

type MapState = {
  session: {
    currentWeek: number;
    currentModuleId: string | null;
    status: "not_started" | "in_progress" | "paused" | "complete";
  } | null;
  chapters: Array<{ chapterNumber: number; language: string }>;
  completedModuleIds: string[];
};

const COPY = {
  en: {
    eyebrow: "The Map",
    title: "Finding the ground beneath you.",
    intro:
      "The Map is a slow walk through how you are wired, what you actually care about, and what is pulling at you right now. Three short sessions, then a personal document you keep — your Operating Manual.",
    begin: "Begin your map",
    resume: "Continue your map",
    open: "Open your Operating Manual",
    generate: "Assemble your Operating Manual",
    notesHeader: "How this works",
    notes: [
      "Each session is short — about five minutes.",
      "You can stop and come back anytime. The map waits.",
      "Anything you write is private. Nothing is shared without your asking.",
      "The Map is for clarity, not diagnosis. It will never tell you what is wrong with you.",
    ],
    back: "Back to dashboard",
  },
  es: {
    eyebrow: "El Mapa",
    title: "Encontrar el suelo bajo tus pies.",
    intro:
      "El Mapa es un recorrido pausado por cómo estás construido, qué te importa de verdad, y qué está tirando de ti ahora mismo. Tres sesiones cortas y, al final, un documento personal que conservas — tu Manual de Operación.",
    begin: "Comienza tu mapa",
    resume: "Continúa tu mapa",
    open: "Abrir tu Manual de Operación",
    generate: "Armar tu Manual de Operación",
    notesHeader: "Cómo funciona",
    notes: [
      "Cada sesión es breve — unos cinco minutos.",
      "Puedes parar y volver cuando quieras. El mapa espera.",
      "Lo que escribas es privado. Nada se comparte sin que lo pidas.",
      "El Mapa busca claridad, no diagnóstico. Nunca te dirá qué está mal contigo.",
    ],
    back: "Volver al panel",
  },
};

export default function MapHubPage() {
  const locale = useLocale() as "en" | "es";
  const t = COPY[locale];
  const [state, setState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void loadState();
  }, []);

  async function loadState() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      const resp = await fetch("/api/map/state", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (resp.ok) setState(await resp.json());
    } finally {
      setLoading(false);
    }
  }

  async function generateChapter() {
    setGenerating(true);
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
        body: JSON.stringify({ chapterNumber: 1, language: locale }),
      });
      if (resp.ok) await loadState();
    } finally {
      setGenerating(false);
    }
  }

  const hasChapter1 = state?.chapters?.some((c) => c.chapterNumber === 1);
  const sessionStatus = state?.session?.status ?? null;
  const isComplete = sessionStatus === "complete";
  const isInProgress = sessionStatus === "in_progress" || sessionStatus === "paused";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      <PageAmbience />
      <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-32">
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium leading-tight text-stone-100 md:text-5xl">
          {t.title}
        </h1>
        <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
          {t.intro}
        </p>
        <div className="mt-10 h-px w-16 bg-[#c4934e]" />

        {/* Primary card */}
        <div className="mt-10 border border-white/10 bg-white/[0.04] p-6 md:p-8">
          {loading ? (
            <p className="text-stone-400">…</p>
          ) : hasChapter1 ? (
            <Link
              href={`/${locale}/map/operating-manual`}
              className="inline-block rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
            >
              {t.open}
            </Link>
          ) : isComplete ? (
            <button
              type="button"
              disabled={generating}
              onClick={generateChapter}
              className="rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
            >
              {generating ? "…" : t.generate}
            </button>
          ) : isInProgress ? (
            <Link
              href={`/${locale}/map/week/1`}
              className="inline-block rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
            >
              {t.resume}
            </Link>
          ) : (
            <Link
              href={`/${locale}/map/begin`}
              className="inline-block rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432]"
            >
              {t.begin}
            </Link>
          )}
        </div>

        {/* How this works */}
        <section className="mt-16">
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-stone-500">
            {t.notesHeader}
          </p>
          <ul className="mt-4 space-y-3">
            {t.notes.map((n) => (
              <li
                key={n}
                className="border-l border-[#c4934e]/50 pl-4 text-sm leading-relaxed text-stone-300 md:text-base"
              >
                {n}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-16 flex items-center justify-between">
          <Link
            href={`/${locale}/dashboard`}
            className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400 transition hover:text-[#c4934e]"
          >
            ← {t.back}
          </Link>
          <LanguagePicker />
        </div>
      </section>
    </main>
  );
}
