"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { PageAmbience } from "@/app/components/pageAmbience";
import { PageTopNav } from "@/app/components/pageTopNav";
import { InactivityGate } from "@/app/components/inactivityGate";
import { LanguagePicker } from "@/app/components/languagePicker";

/**
 * Stone Harbor — /rhythm (SH-40 v1).
 *
 * Member-facing Eidos descriptive mirror. Renders the observed
 * circadian pattern back to the user as a 24-hour histogram + a
 * plain-language summary. v1 is deliberately scoped to the mirror
 * only — no prompts, no proposals, no streaks, no "missed" anything.
 *
 * Design discipline (non-negotiable):
 *   - No streaks. No "missed".
 *   - No prescription before description.
 *   - "Observation, not diagnosis." Hedged language only.
 *   - Confidence-gated: nothing surfaces below 0.7.
 *   - Empty state copy does not shame newness — early members see
 *     "Your rhythm is still emerging."
 *
 * Data flow: client → GET /api/eidos/inferences (this app, Supabase
 * auth gated) → server-only consumer token → engine's EID-52 route.
 *
 * Voice: second-person, gentle, descriptive. Spanish parity from day
 * one (per Spanish Phase 2 discipline). Visual: matches /map's
 * restrained dark + gold aesthetic, no new design system.
 */

// Surfacing confidence threshold from the architecture spec §7.
// Below this we show the early-state placeholder.
const SURFACING_THRESHOLD = 0.7;

const COPY = {
  en: {
    eyebrow: "Your Rhythm",
    title: "The shape of your day.",
    intro:
      "This is what Stone Harbor notices about when you write. No goals, no streaks — just the pattern, returned to you.",
    earlyHeader: "Your rhythm is still emerging.",
    earlyBody:
      "Eidos needs about two weeks of entries to see the pattern clearly. Come back in a few days — the shape will be here.",
    histogramHeader: "Across a day",
    histogramFooter:
      "Each bar is an hour of the day, sized by how often you've written then. Late-night hours are marked.",
    summaryHeader: "What this means",
    confidenceFooter: "Drawn from {sample} entries across {days} days.",
    centroidPrefix: "Your day tends to center around",
    chronoMorning: "You write earliest in the morning.",
    chronoMidMorning: "Your most consistent time is mid-morning.",
    chronoMidday: "Your most consistent time is midday.",
    chronoAfternoon: "Your most consistent time is afternoon.",
    chronoEvening: "Your most consistent time is evening.",
    chronoLateNight: "Your most consistent time is late at night.",
    regularityLow: "Your rhythm is steady — most entries cluster around the same time.",
    regularityMid: "Your rhythm has a few moments in it — not one fixed time, but a small set of recurring ones.",
    regularityHigh: "Your days vary widely. There isn't a single fixed time you tend to write.",
    nightLoadModerate: "About {pct}% of your entries fall in late-night hours (between 11pm and 4am).",
    nightLoadHigh: "Roughly {pct}% of your entries fall in late-night hours. Worth noticing.",
    sjlEarlier: "Your weekends tend to shift earlier by about {hours} hours.",
    sjlLater: "Your weekends tend to shift later by about {hours} hours.",
    sjlBalanced: "Your weekends and weekdays sit close to each other.",
    voiceNote:
      "Stone Harbor watches when, not what. The patterns above are observations, not judgments — yours to take or leave.",
    back: "Dashboard",
    backEyebrow: "Return To Harbor",
    brand: "Stone Harbor",
  },
  es: {
    eyebrow: "Tu Ritmo",
    title: "La forma de tu día.",
    intro:
      "Esto es lo que Stone Harbor nota sobre cuándo escribes. Sin metas, sin rachas — solo el patrón, devuelto a ti.",
    earlyHeader: "Tu ritmo aún está emergiendo.",
    earlyBody:
      "Eidos necesita unas dos semanas de entradas para ver el patrón con claridad. Vuelve en unos días — la forma estará aquí.",
    histogramHeader: "A lo largo de un día",
    histogramFooter:
      "Cada barra es una hora del día, dimensionada por cuántas veces has escrito entonces. Las horas de la madrugada están marcadas.",
    summaryHeader: "Qué significa esto",
    confidenceFooter: "Basado en {sample} entradas a lo largo de {days} días.",
    centroidPrefix: "Tu día tiende a centrarse alrededor de",
    chronoMorning: "Escribes muy temprano por la mañana.",
    chronoMidMorning: "Tu hora más constante es a media mañana.",
    chronoMidday: "Tu hora más constante es al mediodía.",
    chronoAfternoon: "Tu hora más constante es por la tarde.",
    chronoEvening: "Tu hora más constante es por la noche.",
    chronoLateNight: "Tu hora más constante es ya bien entrada la noche.",
    regularityLow: "Tu ritmo es estable — la mayoría de tus entradas se agrupan alrededor de la misma hora.",
    regularityMid: "Tu ritmo tiene unos cuantos momentos — no una hora fija, sino un pequeño conjunto recurrente.",
    regularityHigh: "Tus días varían bastante. No hay una sola hora fija en la que tiendas a escribir.",
    nightLoadModerate: "Alrededor del {pct}% de tus entradas caen en horas de madrugada (entre las 23 y las 4).",
    nightLoadHigh: "Aproximadamente el {pct}% de tus entradas caen en la madrugada. Vale la pena notarlo.",
    sjlEarlier: "Los fines de semana tiendes a moverte unas {hours} horas más temprano.",
    sjlLater: "Los fines de semana tiendes a moverte unas {hours} horas más tarde.",
    sjlBalanced: "Tus fines de semana y días de semana están cerca entre sí.",
    voiceNote:
      "Stone Harbor observa cuándo, no qué. Los patrones de arriba son observaciones, no juicios — tuyos para tomarlos o dejarlos.",
    back: "Panel",
    backEyebrow: "Volver Al Puerto",
    brand: "Stone Harbor",
  },
};

type InferencesState =
  | { kind: "loading" }
  | { kind: "early" }
  | { kind: "engine_error" }
  | {
      kind: "ok";
      confidence: number;
      sample: number;
      days: number;
      histogram: number[];
      centroid: number | null;
      entropy: number | null;
      nightLoad: number | null;
      socialJetLag: number | null;
    };

export default function RhythmPage() {
  const rawLocale = useLocale();
  const locale = (rawLocale === "es" ? "es" : "en") as "en" | "es";
  const t = COPY[locale];

  const [state, setState] = useState<InferencesState>({ kind: "loading" });

  useEffect(() => {
    void loadInferences();
  }, []);

  async function loadInferences() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setState({ kind: "early" });
        return;
      }
      const resp = await fetch("/api/eidos/inferences", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!resp.ok) {
        setState({ kind: "engine_error" });
        return;
      }
      const body = (await resp.json()) as
        | { state: "no_events" | "engine_error" }
        | {
            state: "ok";
            data: {
              user_id: string;
              observations: {
                circadian: null | {
                  confidence: number;
                  sample_size: number;
                  unique_days: number;
                  metrics: {
                    centroid_hour: number | null;
                    regularity_entropy: number | null;
                    night_load_fraction: number | null;
                    social_jet_lag_hours: number | null;
                  };
                  evidence: { hour_histogram?: number[] };
                };
              };
            };
          };

      if (body.state !== "ok") {
        setState({ kind: body.state === "engine_error" ? "engine_error" : "early" });
        return;
      }
      const obs = body.data.observations.circadian;
      if (!obs || obs.confidence < SURFACING_THRESHOLD) {
        setState({ kind: "early" });
        return;
      }

      setState({
        kind: "ok",
        confidence: obs.confidence,
        sample: obs.sample_size,
        days: obs.unique_days,
        histogram: obs.evidence?.hour_histogram ?? new Array(24).fill(0),
        centroid: obs.metrics.centroid_hour,
        entropy: obs.metrics.regularity_entropy,
        nightLoad: obs.metrics.night_load_fraction,
        socialJetLag: obs.metrics.social_jet_lag_hours,
      });
    } catch {
      setState({ kind: "engine_error" });
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A0A0B] text-stone-100">
      <InactivityGate />
      <PageAmbience />
      <PageTopNav
        backHref={`/${locale}/dashboard`}
        backLabel={t.back}
        backEyebrow={t.backEyebrow}
        wordmark={t.brand}
        wordmarkHref={`/${locale}`}
      />

      <section className="relative z-10 mx-auto max-w-2xl px-5 pb-16 md:px-8 md:pb-24">
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

        {state.kind === "loading" && (
          <p className="mt-10 text-sm text-stone-400">…</p>
        )}

        {(state.kind === "early" || state.kind === "engine_error") && (
          <section className="mt-12 border border-white/10 bg-white/[0.04] p-6 md:p-8">
            <p className="font-serif text-2xl text-stone-100">{t.earlyHeader}</p>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-stone-300">
              {t.earlyBody}
            </p>
          </section>
        )}

        {state.kind === "ok" && (
          <>
            <section className="mt-12">
              <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-stone-500">
                {t.histogramHeader}
              </p>
              <Histogram values={state.histogram} />
              <p className="mt-4 max-w-prose text-xs leading-relaxed text-stone-500">
                {t.histogramFooter}
              </p>
            </section>

            <section className="mt-12">
              <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-stone-500">
                {t.summaryHeader}
              </p>
              <Summary state={state} t={t} locale={locale} />
              <p className="mt-8 text-[11px] leading-relaxed text-stone-500">
                {t.confidenceFooter
                  .replace("{sample}", String(state.sample))
                  .replace("{days}", String(state.days))}
              </p>
            </section>

            <section className="mt-12 border-l border-[#c4934e]/40 pl-4">
              <p className="text-xs italic leading-relaxed text-stone-400 md:text-sm">
                {t.voiceNote}
              </p>
            </section>
          </>
        )}

        <div className="mt-16 flex items-center justify-end">
          <LanguagePicker />
        </div>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Histogram component (inline — small enough to not earn its own file)
// ---------------------------------------------------------------------------

function Histogram({ values }: { values: number[] }) {
  // Pad / clip to 24 hours just in case the engine ever returns
  // something off-spec. Defensive but cheap.
  const bars = new Array(24).fill(0).map((_, i) => values[i] ?? 0);
  const max = Math.max(1, ...bars);

  // Hours 23 and 0-4 are the "late-night" range that the spec treats
  // as a distinct signal. Mark them in gold so the operator sees the
  // night-load fraction reflected visually, not just numerically.
  function isNight(hour: number): boolean {
    return hour === 23 || hour <= 4;
  }

  return (
    <div className="mt-4 select-none">
      <div className="flex items-end gap-[2px] h-32 md:h-40">
        {bars.map((value, hour) => {
          const heightPct = (value / max) * 100;
          const night = isNight(hour);
          return (
            <div
              key={hour}
              className="flex-1 relative"
              title={`${hour}:00 — ${value} ${value === 1 ? "entry" : "entries"}`}
            >
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: `${Math.max(heightPct, value > 0 ? 4 : 0)}%`,
                  background: night ? "#c4934e" : "#586558",
                  opacity: value === 0 ? 0.18 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-[2px] text-[9px] uppercase tracking-[0.2em] text-stone-600">
        {bars.map((_value, hour) => (
          <div
            key={hour}
            className="flex-1 text-center"
          >
            {hour % 3 === 0 ? hour : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain-language summary
// ---------------------------------------------------------------------------

function Summary({
  state,
  t,
  locale,
}: {
  state: Extract<InferencesState, { kind: "ok" }>;
  t: (typeof COPY)["en"];
  locale: "en" | "es";
}) {
  const lines: string[] = [];

  if (state.centroid !== null) {
    const formatted = formatHour(state.centroid, locale);
    lines.push(`${t.centroidPrefix} ${formatted}.`);
    lines.push(describeChronotype(state.centroid, t));
  }

  if (state.entropy !== null) {
    if (state.entropy < 0.3) lines.push(t.regularityLow);
    else if (state.entropy < 0.6) lines.push(t.regularityMid);
    else lines.push(t.regularityHigh);
  }

  if (state.nightLoad !== null && state.nightLoad >= 0.1) {
    const pct = Math.round(state.nightLoad * 100);
    const tpl = state.nightLoad >= 0.25 ? t.nightLoadHigh : t.nightLoadModerate;
    lines.push(tpl.replace("{pct}", String(pct)));
  }

  if (state.socialJetLag !== null) {
    const abs = Math.abs(state.socialJetLag);
    if (abs < 0.5) {
      lines.push(t.sjlBalanced);
    } else if (state.socialJetLag > 0) {
      lines.push(t.sjlLater.replace("{hours}", abs.toFixed(1)));
    } else {
      lines.push(t.sjlEarlier.replace("{hours}", abs.toFixed(1)));
    }
  }

  return (
    <div className="mt-5 space-y-4 text-base leading-relaxed text-stone-200 md:text-lg">
      {lines.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

function describeChronotype(centroidHour: number, t: (typeof COPY)["en"]): string {
  if (centroidHour < 6) return t.chronoLateNight;
  if (centroidHour < 9) return t.chronoMorning;
  if (centroidHour < 11) return t.chronoMidMorning;
  if (centroidHour < 14) return t.chronoMidday;
  if (centroidHour < 18) return t.chronoAfternoon;
  if (centroidHour < 23) return t.chronoEvening;
  return t.chronoLateNight;
}

function formatHour(hourFloat: number, locale: "en" | "es"): string {
  // Round to the nearest 15-minute increment so we get "7:36 am" not
  // "7:35:54 am" pretending to a precision the data doesn't have.
  const totalMinutes = Math.round(hourFloat * 60 / 15) * 15;
  let hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  if (hour >= 24) hour -= 24;

  if (locale === "es") {
    // 24-hour Spanish convention with comma is the obvious choice;
    // "7:30" or "21:00" reads as native.
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }
  // English: am/pm.
  const period = hour < 12 ? "am" : "pm";
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  if (minute === 0) return `${h12}${period}`;
  return `${h12}:${minute.toString().padStart(2, "0")}${period}`;
}
