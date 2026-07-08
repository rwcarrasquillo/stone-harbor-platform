"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import {
  MapFrame,
  MapAnchorStrip,
  MapHorizonMark,
  MapVoiceSignature,
  MapActionButton,
  MapActionLink,
  MapLoading,
  useHarborAuthGuard,
} from "./MapChrome";

/**
 * Stone Harbor — /map hub (harbor-vocabulary composition).
 *
 * The Map's home. The primary affordance depends on the caller's
 * session state:
 *   • No session → "Begin your map"
 *   • In progress / paused → "Continue your map"
 *   • Complete, no chapter → "Assemble your Operating Manual"
 *   • Complete, chapter ready → "Open your Operating Manual"
 *
 * Data flow is unchanged from the pre-harbor hub: /api/map/state with a
 * Bearer token, and /api/map/generate-chapter requesting BOTH locales
 * on a single Assemble click so a later language toggle never hits a
 * "not ready" gap.
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

export default function MapHubPage() {
  const t = useTranslations("map");
  const { theme } = useTheme();
  const { ready } = useHarborAuthGuard();

  const [state, setState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void loadState();
  }, [ready]);

  async function loadState() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      // Request BOTH locales on a single Assemble click. Stone Harbor
      // is bilingual; a member who toggles the language switch later
      // should find their Manual already prepared in either language
      // rather than seeing a "not ready yet" gap.
      const resp = await fetch("/api/map/generate-chapter", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ chapterNumber: 1, languages: ["en", "es"] }),
      });
      if (resp.ok) await loadState();
    } finally {
      setGenerating(false);
    }
  }

  if (!ready) {
    return <MapLoading label={t("loading")} />;
  }

  const hasChapter1 = state?.chapters?.some((c) => c.chapterNumber === 1);
  const sessionStatus = state?.session?.status ?? null;
  const isComplete = sessionStatus === "complete";
  const isInProgress =
    sessionStatus === "in_progress" || sessionStatus === "paused";

  const notes = t.raw("hub.notes") as string[];

  return (
    <MapFrame>
      <MapAnchorStrip
        eyebrow={t("hub.eyebrow")}
        title={t("hub.title")}
        support={t("hub.supportLine")}
      />

      <MapHorizonMark />

      {/* Body — the state-driven primary affordance. */}
      <motion.section
        {...cascadeFadeUp}
        transition={cascadeTransition(2)}
        className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 md:px-10"
      >
        {loading ? (
          <p
            className={`${serif.className} text-[15px] italic text-[var(--sh-text-tertiary)]`}
          >
            {t("loading")}
          </p>
        ) : hasChapter1 ? (
          <MapActionLink label={t("hub.cta.open")} href="/map/operating-manual" />
        ) : isComplete ? (
          <div className="flex flex-col items-center gap-3">
            <MapActionButton
              label={t("hub.cta.assemble")}
              onClick={generateChapter}
              loading={generating}
            />
            {generating && (
              <p
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
              >
                {t("hub.generatingLine")}
              </p>
            )}
          </div>
        ) : isInProgress ? (
          <MapActionLink label={t("hub.cta.continue")} href="/map/week/1" />
        ) : (
          <MapActionLink label={t("hub.cta.begin")} href="/map/begin" />
        )}
      </motion.section>

      {/* How this works — one line per note, separated by a bottom
          hairline rather than the old border-l treatment. */}
      <motion.section
        {...cascadeFadeUp}
        transition={cascadeTransition(3)}
        className="mx-auto mt-16 w-full max-w-[720px] px-6 md:px-10"
      >
        <p
          className={`${sans.className} text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--sh-text-tertiary)]`}
        >
          {t("hub.notesHeader")}
        </p>
        <ul className="mt-4">
          {notes.map((note) => (
            <li
              key={note}
              className="relative py-4 text-sm leading-relaxed text-[var(--sh-text-secondary)]"
            >
              {note}
              <span className="pointer-events-none absolute inset-0">
                <HairlineLens position="bottom" theme={theme} />
              </span>
            </li>
          ))}
        </ul>
      </motion.section>

      <MapVoiceSignature step={4}>{t("hub.voiceSignature")}</MapVoiceSignature>
    </MapFrame>
  );
}
