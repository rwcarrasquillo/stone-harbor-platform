"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { serif, sans } from "@/lib/fonts";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import {
  MapFrame,
  MapAnchorStrip,
  MapHorizonMark,
  MapVoiceSignature,
  MapActionButton,
  MapLoading,
  useHarborAuthGuard,
} from "../MapChrome";

/**
 * Stone Harbor — /map/operating-manual (harbor-vocabulary composition).
 *
 * Reads the caller's generated chapter from eidos_chapters and renders
 * it in the harbor's editorial reader. Phase 1 ships Chapter 1 only.
 *
 * Three states:
 *   • chapter present → the reader.
 *   • chapter in the OTHER language only → a quiet backfill affordance
 *     ("Generate in {language}"), reusing the same Map session data.
 *   • neither → a "not ready yet" note pointing back to The Map.
 */

type Chapter = {
  chapterNumber: number;
  language: string;
  body: string;
  model?: string;
  generatedAt?: string;
};

export default function OperatingManualPage() {
  const locale = (useLocale() === "es" ? "es" : "en") as "en" | "es";
  const t = useTranslations("map");
  const { ready } = useHarborAuthGuard();

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  // True when the member has a chapter in the OTHER language but not
  // this one. Drives the "Generate in {language}" affordance below.
  const [otherLangExists, setOtherLangExists] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locale]);

  async function load() {
    setLoading(true);
    setOtherLangExists(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Fetch ALL chapter rows for this member so we know whether the
      // requested locale exists, the other one exists, or neither. RLS
      // on eidos_chapters restricts to the caller's rows; safe to read
      // directly from the client.
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
        // Missing-language path. Member has a chapter, just not in the
        // language they're currently reading the app in.
        setOtherLangExists(true);
      }
    } finally {
      setLoading(false);
    }
  }

  // Generate the chapter in the current locale. Used by the missing-
  // language affordance. Same Map session data; the engine localizes
  // the prompt.
  async function generateInThisLocale() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
        setGenerateError(t("operatingManual.generateFailed"));
        return;
      }
      // Reload so the page flips from the affordance to the chapter.
      await load();
    } catch {
      setGenerateError(t("operatingManual.generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  if (!ready || loading) {
    return <MapLoading label={t("loading")} />;
  }

  const backLink = (
    <Link
      href="/map"
      className={`${sans.className} text-sm text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
    >
      {t("operatingManual.back")}
    </Link>
  );

  if (chapter) {
    const paragraphs = chapter.body
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter((para) => para.length > 0);

    return (
      <MapFrame>
        <MapAnchorStrip
          eyebrow={t("operatingManual.eyebrow")}
          title={t("operatingManual.title")}
        />
        <MapHorizonMark />
        <motion.article
          {...cascadeFadeUp}
          transition={cascadeTransition(2)}
          className={`${serif.className} mx-auto w-full max-w-[720px] px-6 text-[17px] leading-[1.8] text-[var(--sh-text-secondary)] md:px-10`}
        >
          {paragraphs.map((para, i) => (
            <p key={i} className="mt-8 first:mt-0">
              {para}
            </p>
          ))}
          <div className="mt-16">{backLink}</div>
        </motion.article>
        <MapVoiceSignature step={3}>
          {t("operatingManual.voiceSignature")}
        </MapVoiceSignature>
      </MapFrame>
    );
  }

  if (otherLangExists) {
    return (
      <MapFrame>
        <MapAnchorStrip
          eyebrow={t("operatingManual.notReadyEyebrow")}
          title={t("operatingManual.notReady")}
          support={t("operatingManual.onlyOtherLang")}
        />
        <MapHorizonMark />
        <motion.section
          {...cascadeFadeUp}
          transition={cascadeTransition(2)}
          className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-6 px-6 md:px-10"
        >
          <MapActionButton
            label={t("operatingManual.generateInThis")}
            loadingLabel={t("operatingManual.generating")}
            onClick={generateInThisLocale}
            loading={generating}
          />
          {generateError && (
            <p className={`${sans.className} text-sm text-[var(--sh-danger)]`}>
              {generateError}
            </p>
          )}
          {backLink}
        </motion.section>
        <MapVoiceSignature step={3}>
          {t("operatingManual.voiceSignature")}
        </MapVoiceSignature>
      </MapFrame>
    );
  }

  return (
    <MapFrame>
      <MapAnchorStrip
        eyebrow={t("operatingManual.notReadyEyebrow")}
        title={t("operatingManual.notReady")}
        support={t("operatingManual.notReadyBody")}
      />
      <MapHorizonMark />
      <motion.section
        {...cascadeFadeUp}
        transition={cascadeTransition(2)}
        className="mx-auto flex w-full max-w-[720px] justify-center px-6 md:px-10"
      >
        {backLink}
      </motion.section>
      <MapVoiceSignature step={3}>
        {t("operatingManual.voiceSignature")}
      </MapVoiceSignature>
    </MapFrame>
  );
}
