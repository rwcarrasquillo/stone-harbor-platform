"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { CrisisModal } from "@/app/components/crisisModal";

/**
 * Stone Harbor — Eidos module renderer.
 *
 * Generic UI for a single Eidos instrument: header copy, items, a
 * scale of N chips for each item, and a submit button that posts the
 * responses to /api/map/respond.
 *
 * The component is voice-neutral and depends only on what the engine
 * exports plus the consumer-passed strings. It does NOT import from
 * lib/eidos (server-side concern) — it takes the prepared item list
 * as a prop.
 *
 * On successful submit, the onComplete callback fires with the
 * scored result so the parent page can advance.
 */

export type ModuleItem = {
  id: string;
  /** Text rendered in the page's locale; the consumer picked between EN and ES. */
  text: string;
};

export type ModuleScaleOption = {
  /** Numeric value submitted to the engine. */
  value: number | null; // null for "prefer not to say"
  /** Short label shown on the chip. */
  label: string;
};

type Props = {
  /** Eyebrow above the title — e.g. "MODULE 1.2" */
  eyebrow: string;
  /** Module title in the page's voice. */
  title: string;
  /** One paragraph framing the module — Stone Harbor voice. */
  intro: string;
  /** Instrument id matching the engine's InstrumentId union. */
  instrumentId: "phq2gad2" | "bfi10" | "schwartz" | "bpnsfs12";
  /** Items in the order they should be presented. */
  items: ReadonlyArray<ModuleItem>;
  /** Scale options for the Likert. */
  scale: ReadonlyArray<ModuleScaleOption>;
  /** Allow individual items to be skipped (renders a "prefer not to say"). */
  allowSkip?: boolean;
  /** Label for the submit button — locale-aware copy belongs to the parent. */
  submitLabel: string;
  /** Submitting state label. */
  submittingLabel: string;
  /** Called once the responses are accepted by the server. */
  onComplete: (scored: unknown) => void;
};

export function ModuleRenderer({
  eyebrow,
  title,
  intro,
  instrumentId,
  items,
  scale,
  allowSkip,
  submitLabel,
  submittingLabel,
  onComplete,
}: Props) {
  const locale = useLocale();
  const [responses, setResponses] = useState<Record<string, number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Crisis modal state. The API's safety eval result lives here
  // briefly between submission and the user's acknowledgment of the
  // resources. Once dismissed, we run the parent's onComplete so the
  // session can advance.
  const [crisisLevel, setCrisisLevel] = useState<"elevated" | "severe" | null>(null);
  const [pendingScored, setPendingScored] = useState<unknown>(null);

  function setResponse(itemId: string, value: number | null) {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  // For non-PHQ-2/GAD-2 instruments, every item must be answered.
  const allAnswered = allowSkip
    ? items.every((it) => it.id in responses)
    : items.every((it) => responses[it.id] != null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(locale === "es" ? "Inicia sesión para continuar." : "Sign in to continue.");
        setSubmitting(false);
        return;
      }
      const resp = await fetch("/api/map/respond", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          instrumentId,
          responses: items
            .filter((it) => it.id in responses)
            .map((it) => ({ itemId: it.id, value: responses[it.id] })),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setError(json.message || json.error || "submission_failed");
        setSubmitting(false);
        return;
      }
      // If the server's safety eval returned something concerning,
      // hold the advance until the user dismisses the crisis modal.
      // This keeps the resources screen from being scrolled past as
      // the next module renders behind it.
      const safetyLevel = json?.safety?.level;
      if (safetyLevel === "elevated" || safetyLevel === "severe") {
        setPendingScored(json.scored);
        setCrisisLevel(safetyLevel);
      } else {
        onComplete(json.scored);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "submission_failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCrisisDismiss() {
    const scored = pendingScored;
    setCrisisLevel(null);
    setPendingScored(null);
    if (scored !== null) onComplete(scored);
  }

  return (
    <section className="relative z-10 mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-20">
      {/* Eyebrow + Title */}
      <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
        {eyebrow}
      </p>
      <h1 className="mt-3 font-serif text-4xl font-medium leading-tight text-stone-100 md:text-5xl">
        {title}
      </h1>

      {/* Intro paragraph */}
      <p className="mt-6 max-w-prose text-base leading-relaxed text-stone-300 md:text-lg">
        {intro}
      </p>

      <div className="mt-10 h-px w-16 bg-[#c4934e]" />

      {/* Items */}
      <ol className="mt-10 space-y-10">
        {items.map((item, idx) => (
          <li key={item.id} className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-stone-500">
              {String(idx + 1).padStart(2, "0")}
            </p>
            <p className="text-base leading-relaxed text-stone-200 md:text-lg">
              {item.text}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {scale.map((opt) => {
                const selected = responses[item.id] === opt.value;
                return (
                  <button
                    key={`${item.id}-${opt.value ?? "skip"}`}
                    type="button"
                    onClick={() => setResponse(item.id, opt.value)}
                    aria-pressed={selected}
                    className={`rounded-none border px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] transition ${
                      selected
                        ? "border-[#c4934e] bg-[#c4934e] text-black"
                        : "border-white/20 bg-white/[0.05] text-stone-300 hover:border-[#c4934e]/60 hover:text-[#c4934e]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
              {allowSkip && (
                <button
                  type="button"
                  onClick={() => setResponse(item.id, null)}
                  aria-pressed={responses[item.id] === null}
                  className={`rounded-none border px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] transition ${
                    responses[item.id] === null
                      ? "border-stone-400 bg-stone-700 text-white"
                      : "border-white/10 bg-transparent text-stone-500 hover:border-white/30 hover:text-stone-300"
                  }`}
                >
                  {locale === "es" ? "Prefiero no decir" : "Prefer not to say"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Submit */}
      <div className="mt-12 flex flex-col items-start gap-3">
        <button
          type="button"
          disabled={!allAnswered || submitting}
          onClick={submit}
          className="rounded-none border border-[#c4934e] bg-[#a9793d] px-8 py-4 text-xs font-bold uppercase tracking-[0.25em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_35px_rgba(0,0,0,0.4)] transition hover:bg-[#8d6432] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Crisis modal — surfaces when the API's safety eval returns
          elevated or severe. The user must acknowledge before the
          session advances. */}
      <CrisisModal level={crisisLevel} onDismiss={handleCrisisDismiss} />
    </section>
  );
}
