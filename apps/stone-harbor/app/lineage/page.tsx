"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { serif, sans } from "@/lib/fonts";
import { AnchorMark } from "@/app/components/anchorMark";
import { useTheme } from "@/app/components/themeProvider";
import { LineageSection } from "@/app/components/lineageSection";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — Lineage route (production, harbor vocabulary).
 *
 * Dedicated surface for the three optional lineage prompts that used
 * to live inside /welcome (the profile editor). Before this page
 * existed, the dashboard Lineage room linked into /welcome with a
 * #lineage hash — which dropped the member at the top of a profile-
 * editing form and then scrolled to the prompts. Confusing: "I clicked
 * Lineage and got a profile form."
 *
 * This surface separates the act of editing your profile from the act
 * of sitting with the three lineage questions. Same component
 * (LineageSection), same three database columns
 * (profiles.lineage_father_grief, lineage_father_anger,
 * lineage_pattern_to_leave), same auto-collapse-when-empty UX. What's
 * new is the framing: harbor vocabulary chrome around it, and the
 * weight of the prompts gets the room they deserve.
 *
 * Composition (top → bottom):
 *   - Brand header (anchor + "Stone Harbor · Lineage" → /dashboard)
 *   - Anchor strip ("LINEAGE" eyebrow + serif title)
 *   - Centered max-w-[720px] column with LineageSection inside
 *   - Horizon mark + voice signature ("The harbor knows where you began.")
 *   - Crisis footer visible at the bottom (provided by layout, h-full)
 *
 * Save model:
 *   Debounced auto-save (750ms) on every keystroke. No save button,
 *   no "unsaved changes" guard — the three fields are sensitive,
 *   member-private content (nothing displayed anywhere else), and the
 *   right UX is transparent persistence. If the member types and
 *   closes the tab within 750ms, they lose the last keystroke; that's
 *   the only window. Acceptable.
 *
 * Gates:
 *   - Auth: redirect to /login if no user.
 *   - Suspension: redirect to /suspended if profiles.suspended_at set.
 *   - Loading state: a quiet centered note ("Opening the room…").
 *
 * Locale:
 *   This page uses Phase 2 routing (no /[locale] segment in URL).
 *   Locale comes from the NEXT_LOCALE cookie via next-intl, same as
 *   /journal, /dashboard, /vent. Spanish parity from day one.
 *
 * SH-49 (Lineage harbor vocabulary surface in the Linear backlog)
 * is the long-form ticket this page partially fulfills. The full
 * SH-49 scope includes a more developed visual + state model (the
 * "first door" sequence, the 90-day unlock animation, etc.).
 */

export default function LineagePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useTranslations("lineage");

  // null = loading, populated = ready
  const [userId, setUserId] = useState<string | null>(null);

  // The three lineage fields. Local state mirrors the database row;
  // every keystroke updates both local state (for instant UI feedback)
  // and a debounced supabase upsert.
  const [fatherGrief, setFatherGrief] = useState("");
  const [fatherAnger, setFatherAnger] = useState("");
  const [patternToLeave, setPatternToLeave] = useState("");

  // For the LineageSection's initial-collapsed prop. If the member
  // hasn't visited Lineage three times AND all three fields are empty,
  // the section default-collapses to the "OPEN THE ROOM" threshold
  // (matches /welcome's behavior). On every visit we increment the
  // visit counter so the threshold eventually appears.
  const [visitCount, setVisitCount] = useState(0);

  // ───── Load profile data on mount ─────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      // Fetch the three lineage fields + visit_count + the suspension
      // gate in one round-trip.
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "suspended_at, lineage_father_grief, lineage_father_anger, lineage_pattern_to_leave, lineage_section_visit_count",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (profile?.suspended_at) {
        router.replace("/suspended");
        return;
      }

      setUserId(user.id);
      setFatherGrief(profile?.lineage_father_grief ?? "");
      setFatherAnger(profile?.lineage_father_anger ?? "");
      setPatternToLeave(profile?.lineage_pattern_to_leave ?? "");
      setVisitCount(profile?.lineage_section_visit_count ?? 0);

      // Increment the visit counter — same logic /welcome uses. After
      // three visits with all fields still empty, the section
      // default-collapses to the threshold UI on subsequent visits.
      // Fire-and-forget; failure here just means the counter doesn't
      // tick this time, which is fine.
      void supabase
        .from("profiles")
        .update({
          lineage_section_visit_count:
            (profile?.lineage_section_visit_count ?? 0) + 1,
        })
        .eq("id", user.id);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ───── Debounced auto-save ─────
  //
  // Every onChange fires the debounced upsert below. We hold ONE
  // shared timer ref (not per-field) because the member can only type
  // into one textarea at a time — there's no scenario where two
  // fields are debouncing simultaneously, and a shared timer avoids
  // out-of-order writes if the user jumps between fields rapidly.
  //
  // 750ms is the same debounce vent uses for its draft. Long enough
  // that we don't hammer the DB on every keystroke, short enough that
  // the typical user feels their work is safe.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (field: string, value: string) => {
      if (!userId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const { error } = await supabase
          .from("profiles")
          .update({ [field]: value })
          .eq("id", userId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error(`[lineage] auto-save failed (${field}):`, error);
        }
      }, 750);
    },
    [userId],
  );

  // ───── Loading state ─────
  if (userId === null) {
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

  // Default-collapse the section after 3 empty visits, matching
  // /welcome's behavior. visitCount has already been incremented for
  // this visit by the load effect, so "3 prior visits" is checked
  // here as visitCount > 3.
  const allEmpty =
    !fatherGrief.trim() && !fatherAnger.trim() && !patternToLeave.trim();
  const defaultCollapsed = visitCount > 3 && allEmpty;

  return (
    <div
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      <div className="mx-auto flex w-full max-w-[1440px] flex-col">
        {/* ===== Top header =====
            Brand cluster → /dashboard, standard harbor-vocabulary
            pattern. "Stone Harbor · Lineage" reads as a breadcrumb. */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
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
            <span className="text-[16px] text-[var(--sh-text-muted)]">·</span>
            <span
              className={`${serif.className} text-[20px] italic tracking-[-0.012em] text-[var(--sh-text-secondary)]`}
            >
              {t("eyebrow")}
            </span>
          </Link>

          {/* Quiet "back" link in the top-right utility slot — same
              treatment as /journal/archive. */}
          <Link
            href="/dashboard"
            style={{ outline: "none", outlineOffset: 0 }}
            className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)]`}
          >
            ← {t("back")}
          </Link>
        </header>

        {/* ===== Anchor strip =====
            Eyebrow + serif title centered on the page axis. The
            subtitle line below the title explicitly names the
            "optional, harbor-doesn't-keep-score" framing — Lineage is
            the weightiest invitation in the app and the tone has to
            land before the first prompt. */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-8">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {t("eyebrow")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[24px] italic font-medium tracking-[-0.01em]`}
          >
            {t("title")}
          </p>
          <p
            className={`${serif.className} mt-2 text-[14px] italic text-[var(--sh-text-tertiary)]`}
          >
            {t("subtitle")}
          </p>
        </section>

        {/* ===== Lineage content =====
            Centered max-w-[720px] column matches /journal's reader
            width. The LineageSection itself has its own internal
            chrome (eyebrow, prompts, threshold-when-collapsed) which
            we render as-is. The component already handles theme
            awareness and auto-collapse via the defaultCollapsed prop.

            The mt-12 + border-t the LineageSection bakes in (designed
            for use inside the longer /welcome form) reads OK here too
            — gives the section a visual lift off the anchor strip
            without our needing to override anything. */}
        <main className="flex flex-1 flex-col items-center px-10 pb-10">
          <div className="w-full max-w-[720px]">
            <LineageSection
              fatherGrief={fatherGrief}
              fatherAnger={fatherAnger}
              patternToLeave={patternToLeave}
              onChangeFatherGrief={(v) => {
                setFatherGrief(v);
                save("lineage_father_grief", v);
              }}
              onChangeFatherAnger={(v) => {
                setFatherAnger(v);
                save("lineage_father_anger", v);
              }}
              onChangePatternToLeave={(v) => {
                setPatternToLeave(v);
                save("lineage_pattern_to_leave", v);
              }}
              defaultCollapsed={defaultCollapsed}
            />
          </div>
        </main>

        {/* ===== Horizon mark + voice signature =====
            Same engraved-gold lens pair as /journal and /journal/archive,
            with a Lineage-specific voice line. The mark is the visual
            close — what came before is held; the harbor goes on. */}
        <LineageHorizonMark voiceSignature={t("voiceSignature")} />
      </div>
    </div>
  );
}

// ============================================================================
// Components
// ============================================================================

/**
 * Horizon mark for the /lineage foot.
 *
 * Same composition as /journal/archive's ArchiveHorizonMark and
 * /journal's CenteredHorizonMark — engraved-gold rule + breathing
 * anchor + voice signature — with a Lineage-specific line. Inlined
 * here for now; the three horizon marks across journal, archive, and
 * lineage are nearly identical and should eventually factor into a
 * shared component (tracked under SH-46 follow-up).
 */
function LineageHorizonMark({ voiceSignature }: { voiceSignature: string }) {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldHex = theme === "sunlit" ? "#a9793d" : "#c4934e";
  const lineShadow =
    theme === "sunlit"
      ? "0 1px 0 rgba(60,40,15,0.18)"
      : "0 0 4px rgba(196,147,78,0.28)";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center border-t border-[var(--sh-border-subtle)] px-10 pb-10 pt-8">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
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
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill={goldHex} />
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
        className={`${serif.className} mt-5 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {voiceSignature}
      </p>
    </div>
  );
}
