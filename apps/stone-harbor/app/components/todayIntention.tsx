"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Stone Harbor — TodayIntention.
 *
 * A single, optional text field where the member can name what they
 * want today to be about. It persists for the calendar day, then
 * resets. Placeholder rotates between three prompts so the field
 * doesn't feel sterile when blank.
 *
 * Why this lives on the dashboard:
 *   Naming an intention is a tiny commitment that activates self-
 *   concept ("I'm the kind of man who pays attention to today").
 *   It also gives the member a quiet anchor when they return in
 *   the evening — the dashboard can echo it back: "Today you said
 *   you wanted to ___. How was it?" (future enhancement).
 *
 *   Crucially, the field is OPTIONAL. Empty is fine. No shame, no
 *   counter, no streak. The prompt rotation is the only "energy"
 *   the field gives off when unused.
 *
 * Storage:
 *   localStorage keyed by user id + ISO date. No backend yet — the
 *   intention is private to the device for now, which matches Stone
 *   Harbor's privacy posture. When we add backend persistence, we'll
 *   write to a `daily_intentions` table with RLS keyed to the user.
 *
 * Why no submit button:
 *   The field saves on blur and on debounced typing. A submit button
 *   creates pressure to "complete" the intention — which fights the
 *   whole point.
 */

type Props = {
  /** User id so the storage key isolates by account on shared devices. */
  userId?: string | null;
};

// Three prompt keys that rotate behind the input. Strings live in
// `dashboard.todayIntention.prompts.*` so the rotation stays locale-aware.
const PROMPT_KEYS = ["0", "1", "2"] as const;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TodayIntention({ userId }: Props) {
  const t = useTranslations("dashboard.todayIntention");
  const [value, setValue] = useState("");
  const [promptIndex, setPromptIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = useMemo(() => {
    const owner = userId || "anon";
    return `stone-harbor:intention:${owner}:${todayIsoDate()}`;
  }, [userId]);

  // Load existing intention for today.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey) ?? "";
    setValue(saved);
  }, [storageKey]);

  // Rotate the placeholder slowly so the field doesn't feel static.
  useEffect(() => {
    const id = setInterval(
      () => setPromptIndex((i) => (i + 1) % PROMPT_KEYS.length),
      6000,
    );
    return () => clearInterval(id);
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (typeof window === "undefined") return;
      if (next.trim()) {
        window.localStorage.setItem(storageKey, next);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    }, 400);
  }

  function onBlur() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (typeof window === "undefined") return;
    if (value.trim()) {
      window.localStorage.setItem(storageKey, value);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }

  return (
    <section
      aria-label={t("ariaLabel")}
      className="mb-6 md:mb-10"
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--sh-accent-gold)] md:tracking-[0.32em]">
        {t("eyebrow")}
      </p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={t(`prompts.${PROMPT_KEYS[promptIndex]}`)}
        aria-label={t("inputAriaLabel")}
        maxLength={140}
        className="w-full border-b border-[var(--sh-border-medium)] bg-transparent pb-2 text-base italic leading-relaxed text-[var(--sh-text-primary)] outline-none transition placeholder:font-normal placeholder:not-italic placeholder:text-[var(--sh-text-muted)] focus:border-[var(--sh-accent-gold)] md:text-lg"
      />
    </section>
  );
}
