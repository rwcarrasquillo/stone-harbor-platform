"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { serif, sans } from "@/lib/fonts";
import { AnchorMark } from "@/app/components/anchorMark";
import { useTheme } from "@/app/components/themeProvider";
import { supabase } from "@/lib/supabaseClient";
import { requireActiveSession } from "@/lib/authGuards";
import {
  PRACTICE_BLOCK_KEYS,
  getPracticeShape,
  hasDeclaredShape,
  touchLastSeen,
  updatePracticeShape,
  type PracticeBlockKey,
  type PracticeShape,
} from "@/lib/practice";

/**
 * Stone Harbor — /practice route (SH-134, PR 1 of 3).
 *
 * Design brief: stone-harbor-docs/stone-harbor/Stone_Harbor_Practice_Surface_Design.md
 *
 * A dedicated surface where a man names a daily shape — three optional
 * blocks in his own words — and returns to it when the shape drifts.
 * It is scaffold, not chase (brief §3): nothing here schedules,
 * reminds, scores or counts, and nothing leaves the app.
 *
 * Two views, chosen by hasDeclaredShape():
 *   - no blocks named → onboarding: three inputs + "Save the shape"
 *   - any block named → declared: three cards + inline Edit per block
 *
 * Composition follows the journal baseline (the design baseline for
 * text surfaces), top → bottom:
 *   - Brand crumb header (anchor + "Stone Harbor · Practice")
 *   - Anchor strip (eyebrow + serif title)
 *   - Body (inputs or block cards) on the centered reading axis
 *   - Horizon mark + voice signature
 *   - Crisis footer — mounted globally by the root layout, not here
 *
 * NO PageAmbience: /practice matches /journal, not /roadmap.
 *
 * ---------------------------------------------------------------------
 * On the feature flag (app_settings.practice_enabled)
 *
 * The flag ships in practice_001_schema.sql defaulting false, and
 * lib/practice.ts exposes getPracticeEnabled() for PR 2 — but this
 * route deliberately does NOT gate on it.
 *
 * The flag's job in this arc is to keep PR 2's DASHBOARD changes dark:
 * the time-of-day card and the "shape has drifted" return card render
 * on a surface every member already sees, so they need a kill switch.
 * /practice in PR 1 is unlinked — no nav entry, no rooms-strip card
 * (that's PR 2), no dashboard reference — so the only way to reach it
 * is to type the URL. "Zero user-visible change" already holds without
 * the flag, and gating the route would make the surface unreviewable:
 * preview deployments point at the production Supabase project, so
 * hiding it behind a false flag would mean flipping a production flag
 * just to look at a PR.
 *
 * PR 2 gates its dashboard work on getPracticeEnabled(). This route
 * starts gating on it the moment /practice is linked from anywhere.
 * ---------------------------------------------------------------------
 *
 * Auth: requireActiveSession() — signed in, not suspended, settled in
 * (SH-113). last_seen_at is stamped on load, fire-and-forget.
 */

/** Which i18n label + placeholder belongs to each block. */
const BLOCK_COPY: Record<
  PracticeBlockKey,
  { labelKey: string; placeholderKey: string }
> = {
  morning_anchor: {
    labelKey: "blocks.morningAnchor",
    placeholderKey: "blocks.morningPlaceholder",
  },
  midday_touch: {
    labelKey: "blocks.middayTouch",
    placeholderKey: "blocks.middayPlaceholder",
  },
  evening_close: {
    labelKey: "blocks.eveningClose",
    placeholderKey: "blocks.eveningPlaceholder",
  },
};

/** Blank drafts for the onboarding form. */
const EMPTY_DRAFTS: Record<PracticeBlockKey, string> = {
  morning_anchor: "",
  midday_touch: "",
  evening_close: "",
};

export default function PracticePage() {
  const t = useTranslations("practice");

  // null = still loading; the shape itself may legitimately be null
  // (never declared), so readiness is tracked separately.
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [shape, setShape] = useState<PracticeShape | null>(null);

  // Onboarding form state.
  const [drafts, setDrafts] =
    useState<Record<PracticeBlockKey, string>>(EMPTY_DRAFTS);

  // Declared-state inline editing: which block is open, and its text.
  const [editingKey, setEditingKey] = useState<PracticeBlockKey | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const session = await requireActiveSession();
      if (cancelled || !session) return;

      // Fire-and-forget presence stamp. Deliberately not awaited: the
      // member came for the surface, not for a timestamp, and a failed
      // write must never delay or block the render. touchLastSeen
      // swallows its own errors (see lib/practice.ts).
      void touchLastSeen(supabase, session.id);

      const stored = await getPracticeShape(supabase, session.id);
      if (cancelled) return;

      setUserId(session.id);
      setShape(stored);
      setReady(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Save the onboarding form — the member's first declaration. */
  const handleDeclare = useCallback(async () => {
    if (!userId || saving) return;
    setSaving(true);
    const next = await updatePracticeShape(supabase, userId, drafts);
    if (next) {
      setShape(next);
      setDrafts(EMPTY_DRAFTS);
    }
    setSaving(false);
  }, [userId, saving, drafts]);

  /** Save one block from the declared view's inline editor. */
  const handleSaveBlock = useCallback(async () => {
    if (!userId || !editingKey || saving) return;
    setSaving(true);
    const next = await updatePracticeShape(supabase, userId, {
      [editingKey]: editingValue,
    });
    if (next) setShape(next);
    setSaving(false);
    setEditingKey(null);
    setEditingValue("");
  }, [userId, editingKey, editingValue, saving]);

  const openEditor = useCallback((key: PracticeBlockKey, current: string) => {
    setEditingKey(key);
    setEditingValue(current);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingKey(null);
    setEditingValue("");
  }, []);

  // ───── Loading state ─────
  if (!ready) {
    return (
      <div
        className={`${sans.variable} ${serif.variable} flex h-full w-full items-center justify-center text-[var(--sh-text-primary)]`}
      >
        <p
          className={`${serif.className} text-[16px] italic text-[var(--sh-text-tertiary)]`}
        >
          {t("loading")}
        </p>
      </div>
    );
  }

  const declared = hasDeclaredShape(shape);

  // A save with nothing named would write three blank blocks and land
  // the member back on this same view. Keep the button quiet until
  // there are words — no error copy, nothing to correct.
  const draftsHaveWords = PRACTICE_BLOCK_KEYS.some((key) =>
    drafts[key].trim(),
  );

  return (
    <div
      // h-full + overflow-y-auto so the page scrolls within its
      // root-layout slot, leaving the body-level crisis footer visible
      // at the bottom of the viewport (same pattern as /journal).
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Brand crumb header =====
            "Stone Harbor" → /dashboard (the room hub); "Practice" is
            the current surface and carries no link. Same shape as the
            /journal and /letters headers. */}
        <header className="flex flex-shrink-0 items-center border-b border-[var(--sh-border-subtle)] px-6 py-6 sm:px-10">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
              aria-label="Stone Harbor — Dashboard"
            >
              <AnchorMark size={32} />
              <span
                className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-primary)]`}
              >
                Stone Harbor
              </span>
            </Link>
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
            >
              {t("brandCrumb")}
            </span>
          </div>
        </header>

        {/* ===== Anchor strip =====
            Eyebrow + serif title on the page axis. The copy swaps with
            the view — "BEGIN / A shape to return to" before the shape
            exists, "YOUR PRACTICE / The shape you return to." after. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-6 py-8 sm:px-10">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {declared ? t("declaredState.eyebrow") : t("emptyState.eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-center text-[24px] italic font-medium tracking-[-0.01em]`}
          >
            {declared ? t("declaredState.title") : t("emptyState.title")}
          </p>
          <p
            className={`${sans.className} mt-3 max-w-[560px] text-center text-[13px] leading-[1.65] text-[var(--sh-text-secondary)]`}
          >
            {declared
              ? t("declaredState.subheader")
              : t("emptyState.body")}
          </p>
        </section>

        {/* ===== Body ===== */}
        <main className="flex flex-1 flex-col items-center px-6 py-10 sm:px-10">
          <div className="flex w-full max-w-[620px] flex-col gap-6">
            {declared && shape
              ? PRACTICE_BLOCK_KEYS.map((key) => {
                  const label = t(BLOCK_COPY[key].labelKey);
                  const value = shape[key]?.trim() ?? "";
                  const isEditing = editingKey === key;

                  return (
                    <section
                      key={key}
                      className="flex flex-col gap-2 rounded-[10px] border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted)] px-5 py-5"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p
                          className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)]`}
                        >
                          {label}
                        </p>
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => openEditor(key, value)}
                            style={{ outline: "none", outlineOffset: 0 }}
                            className={`${sans.className} -mr-2 -my-2 min-h-[44px] px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
                          >
                            {t("actions.edit")}
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-3">
                          <input
                            type="text"
                            value={editingValue}
                            autoFocus
                            onChange={(e) => setEditingValue(e.target.value)}
                            placeholder={t(BLOCK_COPY[key].placeholderKey)}
                            className={`${serif.className} min-h-[44px] w-full rounded-[8px] border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-page)] px-4 py-3 text-[17px] italic text-[var(--sh-text-primary)] outline-none transition-colors placeholder:not-italic placeholder:text-[var(--sh-text-muted)] focus:border-[var(--sh-accent-gold)]`}
                          />
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void handleSaveBlock()}
                              disabled={saving}
                              style={{ outline: "none", outlineOffset: 0 }}
                              className={`${sans.className} min-h-[44px] rounded-[8px] border border-[var(--sh-accent-gold)] px-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-50`}
                            >
                              {t("actions.saveBlock")}
                            </button>
                            <button
                              type="button"
                              onClick={closeEditor}
                              disabled={saving}
                              style={{ outline: "none", outlineOffset: 0 }}
                              className={`${sans.className} min-h-[44px] px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)] disabled:opacity-50`}
                            >
                              {t("actions.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : value ? (
                        <p
                          className={`${serif.className} text-[19px] italic leading-[1.45] text-[var(--sh-text-primary)]`}
                        >
                          {value}
                        </p>
                      ) : (
                        // An unnamed block inside a declared shape. Not
                        // a gap to fix — the member may only want one
                        // block. Tapping it opens the same editor.
                        <button
                          type="button"
                          onClick={() => openEditor(key, "")}
                          style={{ outline: "none", outlineOffset: 0 }}
                          className={`${serif.className} flex min-h-[44px] items-center text-left text-[17px] italic leading-[1.45] text-[var(--sh-text-muted)] transition-colors hover:text-[var(--sh-text-secondary)]`}
                        >
                          {t("blocks.emptyPlaceholder", {
                            blockLabel: label.toLocaleLowerCase(),
                          })}
                        </button>
                      )}
                    </section>
                  );
                })
              : PRACTICE_BLOCK_KEYS.map((key) => (
                  <label key={key} className="flex flex-col gap-2">
                    <span
                      className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)]`}
                    >
                      {t(BLOCK_COPY[key].labelKey)}
                    </span>
                    <input
                      type="text"
                      value={drafts[key]}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      placeholder={t(BLOCK_COPY[key].placeholderKey)}
                      className={`${serif.className} min-h-[44px] w-full rounded-[8px] border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted)] px-4 py-3 text-[17px] italic text-[var(--sh-text-primary)] outline-none transition-colors placeholder:not-italic placeholder:text-[var(--sh-text-muted)] focus:border-[var(--sh-accent-gold)]`}
                    />
                  </label>
                ))}

            {!declared && (
              <button
                type="button"
                onClick={() => void handleDeclare()}
                disabled={saving || !draftsHaveWords}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} mt-2 min-h-[44px] self-start rounded-[8px] border border-[var(--sh-accent-gold)] px-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-40`}
              >
                {t("actions.save")}
              </button>
            )}
          </div>
        </main>

        <PracticeHorizonMark voiceSignature={t("horizonMark.signature")} />
      </div>
    </div>
  );
}

/**
 * Horizon mark for the foot of /practice.
 *
 * Engraved-gold lens segments + breathing anchor, same mark /journal
 * and /journal/archive close with. Inline-defined here for the same
 * reason the archive defines its own: the three surfaces haven't
 * converged on a shared component yet, and copying the mark is
 * cheaper than freezing its design prematurely.
 */
function PracticeHorizonMark({ voiceSignature }: { voiceSignature: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-6 pb-10 pt-8 sm:px-10">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, transparent 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, rgba(${goldRgb},${lineAlphaInner}) 100%)`,
            boxShadow: lineShadow,
          }}
        />

        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>

        <div
          aria-hidden="true"
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, rgba(${goldRgb},${lineAlphaInner}) 0%, rgba(${goldRgb},${lineAlphaMid}) 50%, transparent 100%)`,
            boxShadow: lineShadow,
          }}
        />
      </motion.div>

      <p
        className={`${serif.className} mt-5 text-center text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
