"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { sans } from "@/lib/fonts";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { bfi10, schwartz, bpnsfs12, phq2gad2 } from "@stone-harbor/eidos";
import { ModuleRenderer, type ModuleScaleOption } from "../../ModuleRenderer";
import {
  MapFrame,
  MapAnchorStrip,
  MapHorizonMark,
  MapVoiceSignature,
  MapLoading,
  useHarborAuthGuard,
} from "../../MapChrome";

/**
 * Stone Harbor — /map/week/[n] (harbor-vocabulary composition).
 *
 * Renders the modules for the requested week. Phase 1 only ships Week 1
 * (Modules 1.1–1.4). The component reads the caller's current state,
 * decides which module to render next, and advances locally after each
 * submission. When all Phase 1 modules are done, redirects back to /map.
 */

type WeekModuleId = "1.1" | "1.2" | "1.3" | "1.4";

type ModuleMeta = {
  eyebrow: string;
  title: string;
  intro: string;
  scaleHeader: string;
  scale: ModuleScaleOption[];
};

export default function MapWeekPage() {
  const params = useParams<{ n: string }>();
  const router = useRouter();
  const locale = useLocale() as "en" | "es";
  const t = useTranslations("map");
  const { ready } = useHarborAuthGuard();

  const weekNum = parseInt(params.n, 10);
  const [currentModuleId, setCurrentModuleId] = useState<WeekModuleId | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    void loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function loadState() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.replace("/login");
        return;
      }
      const resp = await fetch("/api/map/state", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const json = await resp.json();
      // No session yet → send to begin.
      if (!json.session) {
        router.replace("/map/begin");
        return;
      }
      // Session complete → back to hub.
      if (json.session.status === "complete") {
        router.replace("/map");
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

  // Week 2/3 aren't live yet — quiet "coming later" edge state.
  if (weekNum !== 1) {
    return (
      <MapFrame>
        <MapAnchorStrip
          eyebrow={t("week.weekLabel", { n: weekNum })}
          title={t("week.notLive")}
          support={t("week.notLiveBody")}
        />
        <MapHorizonMark />
        <motion.section
          {...cascadeFadeUp}
          transition={cascadeTransition(2)}
          className="mx-auto flex w-full max-w-[720px] justify-center px-6 md:px-10"
        >
          <Link
            href="/map"
            className={`${sans.className} text-sm text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
          >
            {t("week.back")}
          </Link>
        </motion.section>
        <MapVoiceSignature step={3}>
          {t("week.voiceSignature")}
        </MapVoiceSignature>
      </MapFrame>
    );
  }

  if (!ready || loading || !currentModuleId) {
    return <MapLoading label={t("loading")} />;
  }

  const modules = t.raw("week.modules") as Record<WeekModuleId, ModuleMeta>;
  const moduleMeta = modules[currentModuleId];
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
    <MapFrame>
      <MapAnchorStrip
        eyebrow={moduleMeta.eyebrow}
        title={moduleMeta.title}
        support={moduleMeta.intro}
      />

      <MapHorizonMark />

      <motion.section
        {...cascadeFadeUp}
        transition={cascadeTransition(2)}
        className="mx-auto w-full max-w-[720px] px-6 md:px-10"
      >
        <ModuleRenderer
          instrumentId={instrumentId}
          items={items}
          scale={moduleMeta.scale}
          allowSkip={currentModuleId === "1.1"}
          submitLabel={t("week.submit")}
          submittingLabel={t("week.submitting")}
          preferNotToSayLabel={t("week.preferNotToSay")}
          signInError={t("week.signInError")}
          onComplete={() => {
            // Reload state — the server has already advanced the
            // session, so this picks up the next module or routes to
            // the hub if the session is now complete.
            void loadState();
          }}
        />
      </motion.section>

      <MapVoiceSignature step={3}>{t("week.voiceSignature")}</MapVoiceSignature>
    </MapFrame>
  );
}
