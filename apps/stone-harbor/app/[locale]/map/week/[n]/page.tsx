"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";
import { ModuleRenderer, type ModuleScaleOption } from "../../ModuleRenderer";
import { bfi10, schwartz, bpnsfs12, phq2gad2 } from "@/lib/eidos";

/**
 * Stone Harbor — /map/week/[n].
 *
 * Renders the modules for the requested week. Phase 1 only ships
 * Week 1 (Modules 1.1, 1.2, 1.3, 1.4). The component reads the
 * caller's current state, decides which module to render next, and
 * advances locally after each submission. When all Phase 1 modules
 * are done, redirects back to /map.
 */

type WeekModuleId = "1.1" | "1.2" | "1.3" | "1.4";

const COPY = {
  en: {
    submit: "Continue",
    submitting: "Continuing…",
    notLive: "Coming with the next chapter.",
    notLiveBody:
      "Weeks 2 and 3 unlock as the engine grows. For now, finishing Week 1 produces the first chapter of your Operating Manual.",
    back: "Back to the map",
    "1.1": {
      eyebrow: "Module 1.1",
      title: "Where you are, lately.",
      intro:
        "We start with where you actually are. Not where you were, not where you're trying to be — just where you are, this week. Four short questions. You can skip any of them. This will come back around every so often, so we can both see how the ground shifts.",
      scaleHeader: "Over the past two weeks, how often have you been bothered by…",
      scale: [
        { value: 0, label: "Not at all" },
        { value: 1, label: "Several days" },
        { value: 2, label: "More than half" },
        { value: 3, label: "Nearly every day" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.2": {
      eyebrow: "Module 1.2",
      title: "How you are wired.",
      intro:
        "Some parts of you have been steady for years. Long before any storm. We're going to name a few of those steady parts — not so you can be put in a box, but so the rest of what we look at has somewhere honest to start.",
      scaleHeader: "How well does this describe you?",
      scale: [
        { value: 1, label: "Not at all" },
        { value: 2, label: "A little" },
        { value: 3, label: "Somewhat" },
        { value: 4, label: "Mostly" },
        { value: 5, label: "Strongly" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.3": {
      eyebrow: "Module 1.3",
      title: "What you actually care about.",
      intro:
        "Underneath what you do is what you actually care about. Sometimes those line up. Often they don't — especially right now, while everything is being rearranged. We're going to name what matters to you, not what you've been told should matter.",
      scaleHeader: "How much is this like you?",
      scale: [
        { value: 1, label: "Not like me" },
        { value: 2, label: "A little" },
        { value: 3, label: "Somewhat" },
        { value: 4, label: "Mostly" },
        { value: 5, label: "Very" },
        { value: 6, label: "Strongly" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.4": {
      eyebrow: "Module 1.4",
      title: "What's pulling you forward.",
      intro:
        "There are three things every man needs to feel like himself. Real choice in what he does. The sense that he is good at something. And connection to people who matter to him. When those three are met, you feel like you. When one is starving, you feel it — even if you can't name which one.",
      scaleHeader: "How true is this for you right now?",
      scale: [
        { value: 1, label: "Untrue" },
        { value: 2, label: "Slightly" },
        { value: 3, label: "Somewhat" },
        { value: 4, label: "Mostly" },
        { value: 5, label: "Completely" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
  },
  es: {
    submit: "Continuar",
    submitting: "Continuando…",
    notLive: "Próximamente, en el siguiente capítulo.",
    notLiveBody:
      "Las semanas 2 y 3 se abren a medida que el motor crece. Por ahora, terminar la Semana 1 produce el primer capítulo de tu Manual de Operación.",
    back: "Volver al mapa",
    "1.1": {
      eyebrow: "Módulo 1.1",
      title: "Dónde estás, últimamente.",
      intro:
        "Empezamos por dónde estás de verdad. No dónde estabas, no dónde intentas estar — solo dónde estás, esta semana. Cuatro preguntas cortas. Puedes saltarte cualquiera. Esto volverá de vez en cuando, para que ambos veamos cómo se mueve el suelo.",
      scaleHeader: "Durante las últimas dos semanas, ¿con qué frecuencia te ha molestado…?",
      scale: [
        { value: 0, label: "Para nada" },
        { value: 1, label: "Varios días" },
        { value: 2, label: "Más de la mitad" },
        { value: 3, label: "Casi cada día" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.2": {
      eyebrow: "Módulo 1.2",
      title: "Cómo estás construido.",
      intro:
        "Algunas partes de ti han sido constantes por años. Mucho antes de cualquier tormenta. Vamos a nombrar algunas de esas partes constantes — no para encasillarte, sino para que el resto de lo que veamos tenga dónde empezar con honestidad.",
      scaleHeader: "¿Qué tan bien te describe esto?",
      scale: [
        { value: 1, label: "Nada" },
        { value: 2, label: "Poco" },
        { value: 3, label: "Algo" },
        { value: 4, label: "Bastante" },
        { value: 5, label: "Mucho" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.3": {
      eyebrow: "Módulo 1.3",
      title: "Qué te importa de verdad.",
      intro:
        "Debajo de lo que haces está lo que de verdad te importa. A veces coinciden. Muchas veces no — especialmente ahora, mientras todo se está reordenando. Vamos a nombrar lo que te importa, no lo que te han dicho que debería importarte.",
      scaleHeader: "¿Cuánto se parece esto a ti?",
      scale: [
        { value: 1, label: "Para nada" },
        { value: 2, label: "Poco" },
        { value: 3, label: "Algo" },
        { value: 4, label: "Bastante" },
        { value: 5, label: "Mucho" },
        { value: 6, label: "Totalmente" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
    "1.4": {
      eyebrow: "Módulo 1.4",
      title: "Qué te empuja hacia adelante.",
      intro:
        "Hay tres cosas que cada hombre necesita para sentirse él mismo. Elección real en lo que hace. La sensación de que es bueno en algo. Y conexión con personas que importan. Cuando esas tres están cubiertas, te sientes tú. Cuando una se queda corta, lo sientes — aunque no puedas nombrar cuál.",
      scaleHeader: "¿Qué tan cierto es esto para ti ahora?",
      scale: [
        { value: 1, label: "Falso" },
        { value: 2, label: "Algo" },
        { value: 3, label: "Mitad" },
        { value: 4, label: "Casi" },
        { value: 5, label: "Totalmente" },
      ] as ReadonlyArray<ModuleScaleOption>,
    },
  },
};

export default function MapWeekPage() {
  const params = useParams<{ n: string }>();
  const router = useRouter();
  const locale = useLocale() as "en" | "es";
  const t = COPY[locale];

  const weekNum = parseInt(params.n, 10);
  const [currentModuleId, setCurrentModuleId] = useState<WeekModuleId | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadState() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.replace(`/${locale}/login`);
        return;
      }
      const resp = await fetch("/api/map/state", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      // No session yet → send to begin.
      if (!json.session) {
        router.replace(`/${locale}/map/begin`);
        return;
      }
      // Session complete → back to hub.
      if (json.session.status === "complete") {
        router.replace(`/${locale}/map`);
        return;
      }
      setCurrentModuleId(json.session.currentModuleId as WeekModuleId | null);
    } finally {
      setLoading(false);
    }
  }

  // Locale-aware item lists.
  const itemsByModule = useMemo(() => {
    return {
      "1.1": phq2gad2.items.map((it) => ({
        id: it.id,
        text: locale === "es" ? it.textEs : it.textEn,
      })),
      "1.2": bfi10.items.map((it) => ({
        id: it.id,
        text: locale === "es" ? it.textEs : it.textEn,
      })),
      "1.3": schwartz.items.map((it) => ({
        id: it.id,
        text: locale === "es" ? it.textEs : it.textEn,
      })),
      "1.4": bpnsfs12.items.map((it) => ({
        id: it.id,
        text: locale === "es" ? it.textEs : it.textEn,
      })),
    };
  }, [locale]);

  if (weekNum !== 1) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
        <PageAmbience />
        <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-32">
          <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
            {`Week ${weekNum}`}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-medium leading-tight md:text-5xl">
            {t.notLive}
          </h1>
          <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
            {t.notLiveBody}
          </p>
          <a
            href={`/${locale}/map`}
            className="mt-10 inline-block rounded-none border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black"
          >
            ← {t.back}
          </a>
        </section>
      </main>
    );
  }

  if (loading || !currentModuleId) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
        <PageAmbience />
        <section className="relative z-10 mx-auto max-w-2xl px-5 py-20 md:px-8 md:py-32">
          <p className="text-stone-400">…</p>
        </section>
      </main>
    );
  }

  const moduleMeta = t[currentModuleId];
  const items = itemsByModule[currentModuleId];
  const instrumentId =
    currentModuleId === "1.1"
      ? ("phq2gad2" as const)
      : currentModuleId === "1.2"
        ? ("bfi10" as const)
        : currentModuleId === "1.3"
          ? ("schwartz" as const)
          : ("bpnsfs12" as const);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      <PageAmbience />
      <ModuleRenderer
        eyebrow={moduleMeta.eyebrow}
        title={moduleMeta.title}
        intro={moduleMeta.intro}
        instrumentId={instrumentId}
        items={items}
        scale={moduleMeta.scale}
        allowSkip={currentModuleId === "1.1"}
        submitLabel={t.submit}
        submittingLabel={t.submitting}
        onComplete={() => {
          // Reload state — the server has already advanced the
          // session, so this picks up the next module or routes to
          // the hub if the session is now complete.
          void loadState();
        }}
      />
    </main>
  );
}
