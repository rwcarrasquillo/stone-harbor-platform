"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
 * Stone Harbor — /map/begin (harbor-vocabulary composition).
 *
 * The opening screen of The Map: three quiet paragraphs, a small
 * crisis line, a passive consent statement (beginning IS the consent —
 * there is no gating checkbox), and a Begin affordance that POSTs
 * /api/map/begin then routes to /map/week/1. If a session already
 * exists, the page jumps straight to week 1.
 */

export default function MapBeginPage() {
  const router = useRouter();
  const t = useTranslations("map");
  const { ready } = useHarborAuthGuard();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists, jump straight to week 1.
  useEffect(() => {
    if (!ready) return;
    void checkExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function checkExisting() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const resp = await fetch("/api/map/state", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.session) {
      router.replace("/map/week/1");
    }
  }

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t("begin.signInError"));
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
      router.push("/map/week/1");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <MapLoading label={t("loading")} />;
  }

  const body = t.raw("begin.body") as string[];

  return (
    <MapFrame>
      <MapAnchorStrip eyebrow={t("begin.eyebrow")} title={t("begin.title")} />

      <MapHorizonMark />

      <motion.section
        {...cascadeFadeUp}
        transition={cascadeTransition(2)}
        className="mx-auto w-full max-w-[720px] px-6 md:px-10"
      >
        <div
          className={`${sans.className} space-y-6 text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg`}
        >
          {body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {/* Crisis line — present but small, as in the current begin. */}
        <p
          className={`${serif.className} mt-10 text-sm italic leading-relaxed text-[var(--sh-text-tertiary)] md:text-base`}
        >
          {t("begin.crisis")}
        </p>

        {/* Passive consent — beginning is the consent; no gating box. */}
        <p
          className={`${sans.className} mt-10 text-xs leading-relaxed text-[var(--sh-text-tertiary)]`}
        >
          {t("begin.consentLabel")}
        </p>

        <div className="mt-8 flex items-center gap-6">
          <MapActionButton
            label={t("begin.cta.begin")}
            loadingLabel={t("begin.beginning")}
            onClick={begin}
            loading={busy}
          />
          <Link
            href="/dashboard"
            className={`${sans.className} text-sm text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
          >
            {t("begin.cta.notNow")}
          </Link>
        </div>

        {error && (
          <p
            className={`${sans.className} mt-4 text-sm text-[#b14a3a]`}
            role="alert"
          >
            {error}
          </p>
        )}
      </motion.section>

      <MapVoiceSignature step={3}>{t("begin.voiceSignature")}</MapVoiceSignature>
    </MapFrame>
  );
}
