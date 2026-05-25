"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";

/**
 * Stone Harbor — /map/begin.
 *
 * The opening screen of The Map. Three short paragraphs in Stone
 * Harbor voice, a quiet consent line, and a "begin" button that
 * POSTs /api/map/begin then routes to /map/week/1.
 *
 * Tone notes:
 *   • No clinical language. No "assessment." No "instrument."
 *   • The voice is the literary brother — direct, dignified, calm.
 *   • The crisis-resources line is present but small.
 */

const COPY = {
  en: {
    eyebrow: "Before we begin",
    title: "A few quiet words.",
    para1:
      "The Map is not a test. There are no right answers. Nothing you write here is shared with anyone — not other members, not the team, not your employer if you have one. It is yours.",
    para2:
      "We will move through three short sessions today. Five or so minutes each. Take a breath between them if you want. The map waits.",
    para3:
      "What you will get at the end is a personal document — your Operating Manual — written in your specific situation. Not a diagnosis. Not a label. A description that, on the right day, is worth re-reading.",
    crisis:
      "If at any point things feel sharper than this page can hold, 988 is one tap away — call or text. The harbor will still be here.",
    consent:
      "By beginning, I understand that The Map is for clarity, not diagnosis, and that I can stop at any time.",
    begin: "Begin",
    beginning: "Beginning…",
    back: "Not now",
  },
  es: {
    eyebrow: "Antes de empezar",
    title: "Unas pocas palabras tranquilas.",
    para1:
      "El Mapa no es una prueba. No hay respuestas correctas. Nada de lo que escribas aquí se comparte con nadie — ni con otros miembros, ni con el equipo, ni con tu empleador si tienes uno. Es tuyo.",
    para2:
      "Hoy vamos a recorrer tres sesiones cortas. Unos cinco minutos cada una. Respira entre ellas si quieres. El mapa espera.",
    para3:
      "Lo que recibirás al final es un documento personal — tu Manual de Operación — escrito para tu situación específica. No es un diagnóstico. No es una etiqueta. Es una descripción que, en el día adecuado, vale la pena releer.",
    crisis:
      "Si en algún momento las cosas se sienten más agudas de lo que esta página puede sostener, el 988 está a un toque — llamada o mensaje. El puerto seguirá aquí.",
    consent:
      "Al comenzar, entiendo que El Mapa es para claridad, no para diagnóstico, y que puedo detenerme en cualquier momento.",
    begin: "Comenzar",
    beginning: "Comenzando…",
    back: "Ahora no",
  },
};

export default function MapBeginPage() {
  const router = useRouter();
  const locale = useLocale() as "en" | "es";
  const t = COPY[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists, jump straight to week 1.
  useEffect(() => {
    void checkExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkExisting() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const resp = await fetch("/api/map/state", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.session) {
      router.replace(`/${locale}/map/week/1`);
    }
  }

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(locale === "es" ? "Inicia sesión para continuar." : "Sign in to continue.");
        return;
      }
      const resp = await fetch("/api/map/begin", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setError(j.message || j.error || "begin_failed");
        return;
      }
      router.push(`/${locale}/map/week/1`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      <PageAmbience />
      <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-32">
        <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium italic leading-tight text-stone-100 md:text-5xl">
          {t.title}
        </h1>

        <div className="mt-10 space-y-6 text-base leading-relaxed text-stone-300 md:text-lg">
          <p>{t.para1}</p>
          <p>{t.para2}</p>
          <p>{t.para3}</p>
        </div>

        <div className="mt-10 border-l border-[#c4934e] pl-4">
          <p className="text-sm italic leading-relaxed text-stone-400 md:text-base">
            {t.crisis}
          </p>
        </div>

        <div className="mt-10 h-px w-16 bg-[#c4934e]" />

        <p className="mt-10 text-xs leading-relaxed text-stone-500">
          {t.consent}
        </p>

        <div className="mt-8 flex items-center gap-6">
          <button
            type="button"
            disabled={busy}
            onClick={begin}
            className="rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white transition hover:bg-[#8d6432] disabled:opacity-50"
          >
            {busy ? t.beginning : t.begin}
          </button>
          <a
            href={`/${locale}/dashboard`}
            className="text-[10px] font-bold uppercase tracking-[0.28em] text-stone-400 transition hover:text-[#c4934e]"
          >
            {t.back}
          </a>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
