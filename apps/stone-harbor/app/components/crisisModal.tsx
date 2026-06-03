"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale } from "next-intl";

/**
 * Stone Harbor — CrisisModal.
 *
 * Surfaced when the Map's safety evaluator returns a level other
 * than "none." Lists country-specific crisis resources, lets the
 * member dismiss the modal explicitly (we don't auto-close on
 * outside click — the dismissal is the acknowledgment), and offers
 * the option to pause the Map for now.
 *
 * Phase 1 levels:
 *   - "elevated"  — surface resources, don't block continuing
 *   - "severe"    — surface resources, soft-suggest pause but do not
 *                   force-block (no licensed clinician in the loop yet;
 *                   blocking is reserved for Phase 2 when PHQ-9 item 9
 *                   detection ships)
 *
 * Resources cover the same regions documented in the Crisis Protocol
 * appendix of the Admin Manual. The list is hard-coded here (not
 * driven from the DB) because crisis resources should not depend on
 * a successful database read at the moment they're needed.
 */

type Props = {
  level: "elevated" | "severe" | null;
  onDismiss: () => void;
  /** Optional: caller wires this to pause the Map session. */
  onPause?: () => void;
};

const COPY = {
  en: {
    eyebrowElevated: "A quiet word",
    eyebrowSevere: "Pause with us for a moment",
    titleElevated: "What you just shared matters.",
    titleSevere: "You don't have to carry this alone right now.",
    bodyElevated:
      "Some of what you wrote suggests you're carrying more weight than usual right now. That is not a verdict on you. It is a signal worth honoring. If any of this feels sharper than this page can hold, the resources below are open 24/7 — call or text, in your language.",
    bodySevere:
      "Some of what you wrote suggests you might be in a heavier place than this app can support on its own. There is no judgment in that, and no record of this moment will be shared with anyone. If you can, reach out to one of the resources below right now. They exist for exactly this.",
    resourcesHeader: "If you are in crisis",
    resources: [
      { region: "United States", text: "988 — call or text. Free. 24/7." },
      { region: "United States — text", text: "Crisis Text Line. Text HOME to 741741." },
      { region: "United Kingdom", text: "Samaritans. 116 123, free, 24/7." },
      { region: "Canada", text: "Talk Suicide Canada. 1-833-456-4566." },
      { region: "Australia", text: "Lifeline. 13 11 14." },
      { region: "International", text: "findahelpline.com — search by country." },
    ],
    pauseLabel: "Pause the map for now",
    continueLabel: "I'm okay to keep going",
    softNote:
      "If a real person — a friend, a partner, a clinician — would feel safer right now than this app, that's the right call. The harbor will be here when you come back.",
  },
  es: {
    eyebrowElevated: "Una palabra tranquila",
    eyebrowSevere: "Pausa con nosotros un momento",
    titleElevated: "Lo que compartiste importa.",
    titleSevere: "No tienes que cargar esto solo ahora mismo.",
    bodyElevated:
      "Algo de lo que escribiste sugiere que estás cargando más peso de lo habitual ahora mismo. Eso no es un veredicto sobre ti. Es una señal que vale la pena honrar. Si algo se siente más agudo de lo que esta página puede sostener, los recursos abajo están abiertos 24/7 — llamada o mensaje, en tu idioma.",
    bodySevere:
      "Algo de lo que escribiste sugiere que podrías estar en un lugar más pesado de lo que esta app puede sostener por sí sola. No hay juicio en eso, y no se compartirá ningún registro de este momento con nadie. Si puedes, comunícate con uno de los recursos abajo ahora mismo. Existen exactamente para esto.",
    resourcesHeader: "Si estás en crisis",
    resources: [
      { region: "Estados Unidos", text: "988 — llamada o mensaje. Gratis. 24/7." },
      { region: "Estados Unidos — texto", text: "Crisis Text Line. Envía HOME al 741741." },
      { region: "España", text: "Teléfono de la Esperanza. 717 003 717, 24/7." },
      { region: "México", text: "SAPTEL. 55 5259-8121, 24/7." },
      { region: "Argentina", text: "Centro de Asistencia al Suicida. 135." },
      { region: "Internacional", text: "findahelpline.com — busca por país." },
    ],
    pauseLabel: "Pausar el mapa por ahora",
    continueLabel: "Estoy bien para continuar",
    softNote:
      "Si una persona real — un amigo, una pareja, un profesional — se sentiría más segura ahora mismo que esta app, esa es la decisión correcta. El puerto seguirá aquí cuando vuelvas.",
  },
};

export function CrisisModal({ level, onDismiss, onPause }: Props) {
  const locale = useLocale() as "en" | "es";
  const t = COPY[locale];

  // Lock body scroll while the modal is open so the page underneath
  // doesn't scroll out from behind it.
  useEffect(() => {
    if (!level) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [level]);

  return (
    <AnimatePresence>
      {level && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/85 backdrop-blur-md md:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crisis-modal-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative w-full max-w-xl border-t border-[#c4934e] bg-[#0A0A0B] px-6 py-8 md:border md:px-10 md:py-12"
          >
            {/* Warm radial wash so the modal reads as a soft holding
                surface, not a clinical alert box. */}
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(196,147,78,0.14) 0%, transparent 65%)",
              }}
            />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-[#c4934e]">
                {level === "severe" ? t.eyebrowSevere : t.eyebrowElevated}
              </p>
              <h2
                id="crisis-modal-title"
                className="mt-3 font-serif text-2xl font-medium leading-tight text-stone-100 md:text-3xl"
              >
                {level === "severe" ? t.titleSevere : t.titleElevated}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-stone-300 md:text-lg">
                {level === "severe" ? t.bodySevere : t.bodyElevated}
              </p>

              <div className="mt-8 h-px w-16 bg-[#c4934e]" />

              <section className="mt-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.36em] text-stone-400">
                  {t.resourcesHeader}
                </p>
                <ul className="mt-4 space-y-3">
                  {t.resources.map((r) => (
                    <li key={r.region} className="text-sm leading-relaxed text-stone-200 md:text-base">
                      <span className="font-semibold text-[#c4934e]">{r.region}</span>
                      <span className="mx-2 text-stone-500">·</span>
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="mt-8 max-w-prose text-sm italic leading-relaxed text-stone-400 md:text-base">
                {t.softNote}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {onPause && (
                  <button
                    type="button"
                    onClick={() => {
                      onPause();
                      onDismiss();
                    }}
                    className="rounded-none border border-[#c4934e] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-[#c4934e] transition hover:bg-[#c4934e] hover:text-black"
                  >
                    {t.pauseLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-none border border-white/20 bg-white/[0.05] px-6 py-3 text-xs font-bold uppercase tracking-[0.25em] text-stone-300 transition hover:bg-white/10"
                >
                  {t.continueLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
