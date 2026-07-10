"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CrisisModal } from "@/app/components/crisisModal";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import { MapActionButton } from "./MapChrome";

/**
 * Stone Harbor — Eidos module renderer (harbor-vocabulary composition).
 *
 * The interactive body of a single Eidos instrument: a numbered item
 * list, a row of response chips per item, and a submit affordance that
 * POSTs to /api/map/respond. The module's eyebrow / title / intro now
 * live in the page's anchor strip (see week/[n]/page.tsx), so this
 * component renders only the items + submit + crisis modal.
 *
 * Voice-neutral: depends only on what the engine exports plus the
 * consumer-passed strings. Does NOT import from lib/eidos (server-side
 * concern) — it takes the prepared item list as a prop.
 *
 * Chip treatment matches the post-SH-93 /profile known_languages field:
 * bare sentence-case labels, no borders or fills, paired HairlineLens
 * as the selected/hover/focus signal.
 *
 * On successful submit the onComplete callback fires with the scored
 * result so the parent page can advance. A safety-eval flag holds the
 * advance behind the CrisisModal until the member acknowledges it.
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
  /** Instrument id matching the engine's InstrumentId union. */
  instrumentId: "phq2gad2" | "bfi10" | "schwartz" | "bpnsfs12";
  /** Items in the order they should be presented. */
  items: ReadonlyArray<ModuleItem>;
  /** Scale options for the Likert. */
  scale: ReadonlyArray<ModuleScaleOption>;
  /** Allow individual items to be skipped (renders a "prefer not to say"). */
  allowSkip?: boolean;
  /** Label for the submit button. */
  submitLabel: string;
  /** Submitting state label. */
  submittingLabel: string;
  /** Localized "prefer not to say" chip label. */
  preferNotToSayLabel: string;
  /** Localized "sign in to continue" error. */
  signInError: string;
  /** Called once the responses are accepted by the server. */
  onComplete: (scored: unknown) => void;
};

export function ModuleRenderer({
  instrumentId,
  items,
  scale,
  allowSkip,
  submitLabel,
  submittingLabel,
  preferNotToSayLabel,
  signInError,
  onComplete,
}: Props) {
  const { theme } = useTheme();
  const [responses, setResponses] = useState<Record<string, number | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Crisis modal state. The API's safety eval result lives here briefly
  // between submission and the user's acknowledgment of the resources.
  // Once dismissed, we run the parent's onComplete so the session can
  // advance.
  const [crisisLevel, setCrisisLevel] = useState<
    "elevated" | "severe" | null
  >(null);
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(signInError);
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
      // If the server's safety eval returned something concerning, hold
      // the advance until the user dismisses the crisis modal. This
      // keeps the resources screen from being scrolled past as the next
      // module renders behind it.
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
    <div>
      {/* Items */}
      <ol className="space-y-10">
        {items.map((item, idx) => (
          <li key={item.id} className="space-y-3">
            <p className="text-sm text-[var(--sh-text-tertiary)]">
              {String(idx + 1).padStart(2, "0")}
            </p>
            <p className="text-base leading-relaxed text-[var(--sh-text-primary)] md:text-lg">
              {item.text}
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-5 pt-1">
              {scale.map((opt) => {
                const active = responses[item.id] === opt.value;
                return (
                  <button
                    key={`${item.id}-${opt.value ?? "skip"}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setResponse(item.id, opt.value)}
                    className={`group relative px-1 pb-2 pt-1 text-sm transition-colors focus:outline-none ${
                      active
                        ? "text-[var(--sh-text-primary)]"
                        : "text-[var(--sh-text-secondary)] hover:text-[var(--sh-accent-gold)]"
                    }`}
                  >
                    {opt.label}
                    <span
                      className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
                        active
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                      }`}
                    >
                      <HairlineLens position="top" theme={theme} />
                      <HairlineLens position="bottom" theme={theme} />
                    </span>
                  </button>
                );
              })}
              {allowSkip && (
                <button
                  type="button"
                  aria-pressed={responses[item.id] === null}
                  onClick={() => setResponse(item.id, null)}
                  className={`group relative px-1 pb-2 pt-1 text-sm transition-colors focus:outline-none ${
                    responses[item.id] === null
                      ? "text-[var(--sh-text-primary)]"
                      : "text-[var(--sh-text-tertiary)] hover:text-[var(--sh-accent-gold)]"
                  }`}
                >
                  {preferNotToSayLabel}
                  <span
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
                      responses[item.id] === null
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                    }`}
                  >
                    <HairlineLens position="top" theme={theme} />
                    <HairlineLens position="bottom" theme={theme} />
                  </span>
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* Submit */}
      <div className="mt-12 flex flex-col items-start gap-3">
        <MapActionButton
          label={submitLabel}
          loadingLabel={submittingLabel}
          onClick={submit}
          loading={submitting}
          disabled={!allAnswered}
        />
        {error && (
          <p className="text-sm text-[#b14a3a]" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Crisis modal — surfaces when the API's safety eval returns
          elevated or severe. The user must acknowledge before the
          session advances. */}
      <CrisisModal level={crisisLevel} onDismiss={handleCrisisDismiss} />
    </div>
  );
}
