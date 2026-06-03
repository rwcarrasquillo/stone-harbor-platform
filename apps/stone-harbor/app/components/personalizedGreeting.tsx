"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { serif } from "@/lib/fonts";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Stone Harbor — PersonalizedGreeting.
 *
 * The first thing a member sees on the dashboard. Time-aware and
 * days-since-last-visit aware. The goal isn't information — it's
 * *attunement*. A man arriving at 5:47am after a sleepless night
 * shouldn't see the same greeting as a man arriving at 2pm on a
 * Tuesday. Same for someone who's been away seven days versus
 * yesterday.
 *
 * Therapeutic frame:
 *   Like the opening of a therapy session, the greeting should mirror
 *   the member's state before inviting any work. We follow the
 *   structure: notice arrival → grant permission → leave space.
 *   Never urgency. Never task language.
 *
 * Days-since-last-visit signal:
 *   Tracked locally via localStorage keyed by user id. Imperfect
 *   (cleared if cookies clear, doesn't sync across devices), but
 *   privacy-preserving and zero backend complexity for now. The
 *   profiles table can grow a `last_seen_at` column later and we'll
 *   migrate this hook to read from there.
 *
 * Why client-side rendering:
 *   The greeting depends on the user's local time and a localStorage
 *   read — both browser-only. The serif fallback while it computes
 *   is intentional (one frame of a generic "Welcome." then it
 *   resolves to the personalized version).
 */
type Props = {
  /** Member's display name. First name is used; falls back to "friend". */
  name?: string | null;
  /** Member's user id — used to key the last-visit timestamp per account. */
  userId?: string | null;
};

type GreetingCopy = {
  salutation: string;
  body: string;
};

/**
 * Resolve the user-facing first name. The catalog provides the
 * locale-aware fallback (e.g. "friend" / "amigo") via the
 * `personalizedGreeting.fallbackName` key.
 */
function firstName(
  name: string | null | undefined,
  fallback: string,
): string {
  if (!name) return fallback;
  return name.trim().split(/\s+/)[0] || fallback;
}

/**
 * Pure function — takes the inputs and a `t` translator and returns
 * the right copy. Kept pure (no hook calls inside) so it's easy to
 * unit-test independently of the component. The translator is scoped
 * to `dashboard.personalizedGreeting`.
 */
function chooseGreeting({
  hour,
  daysSinceLastVisit,
  name,
  t,
}: {
  hour: number;
  daysSinceLastVisit: number | null;
  name?: string | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}): GreetingCopy {
  const first = firstName(name, t("fallbackName"));
  const isLateNight = hour < 5 || hour >= 22;
  const isMorning = hour >= 5 && hour < 12;
  const isAfternoon = hour >= 12 && hour < 17;
  // evening is 17-21

  const timeOfDayGreeting = isMorning
    ? t("greetings.morning")
    : isAfternoon
      ? t("greetings.afternoon")
      : t("greetings.evening");

  // First visit ever, or same-day return — the most "neutral" state.
  if (daysSinceLastVisit === null || daysSinceLastVisit === 0) {
    if (isLateNight) {
      return {
        salutation: t("firstVisit.lateNightSalutation", { name: first }),
        body: t("firstVisit.lateNightBody"),
      };
    }
    return {
      salutation: t("firstVisit.salutation", {
        greeting: timeOfDayGreeting,
        name: first,
      }),
      body: t("firstVisit.body"),
    };
  }

  // Been away a long time — explicitly grant permission to start over.
  if (daysSinceLastVisit >= 7) {
    return {
      salutation: t("longGone.salutation", { name: first }),
      body: t("longGone.body"),
    };
  }

  // A few days — acknowledge the gap without pressure.
  if (daysSinceLastVisit >= 3) {
    return {
      salutation: t("fewDays.salutation", { name: first }),
      body: t("fewDays.body"),
    };
  }

  // 1–2 days. Familiar, light.
  if (isLateNight) {
    return {
      salutation: t("recent.lateNightSalutation", { name: first }),
      body: t("recent.lateNightBody"),
    };
  }
  return {
    salutation: t("recent.salutation", {
      greeting: timeOfDayGreeting,
      name: first,
    }),
    body: t("recent.body"),
  };
}

export function PersonalizedGreeting({ name, userId }: Props) {
  const t = useTranslations("dashboard.personalizedGreeting");
  const [copy, setCopy] = useState<GreetingCopy>({
    salutation: t("defaultSalutation"),
    body: t("defaultBody"),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = userId
      ? `stone-harbor:last-visit:${userId}`
      : "stone-harbor:last-visit";

    const previousRaw = window.localStorage.getItem(storageKey);
    const previous = previousRaw ? Number(previousRaw) : null;

    const now = Date.now();
    const daysSinceLastVisit =
      previous && !Number.isNaN(previous)
        ? Math.floor((now - previous) / 86_400_000)
        : null;

    // Stamp the new visit immediately so the next render has a baseline.
    window.localStorage.setItem(storageKey, String(now));

    const hour = new Date().getHours();
    setCopy(chooseGreeting({ hour, daysSinceLastVisit, name, t }));
  }, [name, userId, t]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.patient, ease: EASE.settle }}
      className="mb-5 md:mb-8"
      aria-label={t("ariaLabel")}
    >
      <h1
        className={`${serif.className} text-3xl font-medium italic leading-[1.05] text-[var(--sh-text-primary)] md:text-5xl`}
      >
        {copy.salutation}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--sh-text-secondary)] md:mt-3 md:text-base">
        {copy.body}
      </p>
    </motion.section>
  );
}
