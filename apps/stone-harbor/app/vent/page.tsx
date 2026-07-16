"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { emitMemberEvent, trackMilestone } from "@/lib/memberUsage";
import { serif, sans } from "@/lib/fonts";
import { InactivityGate } from "@/app/components/inactivityGate";
import { AnchorMark } from "@/app/components/anchorMark";
import { HairlineLens } from "@/app/components/hairlineLens";
import { HorizonSegment } from "@/app/components/horizonSegment";
import { useTheme } from "@/app/components/themeProvider";
import { UnsavedChangesModal } from "@/app/components/unsavedChangesModal";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";

/**
 * Stone Harbor — Vent route (production, centered design).
 *
 * The lowest-friction "I need to dump this right now" writing surface,
 * wrapped in the harbor vocabulary shared with /journal and /dashboard:
 * top brand header (anchor + "Stone Harbor · Vent"), anchor strip with
 * the page's intention, centered writing surface, horizon mark + voice
 * signature, crisis footer permanently visible.
 *
 * Vent is the door a member reaches for when they can't face the full
 * journal — open it, put it down, and the harbor keeps it without
 * keeping score. The save path is identical to a journal entry; only
 * the friction is lower.
 *
 * Behaviour preserved from the original /vent:
 *   - 4 mood chips (angry / scared / sad / numb) — Plutchik core +
 *     dissociation; the most common "I can't articulate this" states.
 *   - localStorage draft persistence at `stone-harbor:vent-draft` so
 *     a tab refresh / battery die / panic close never loses content.
 *   - Auto-save debounced 250ms on every keystroke or mood selection.
 *   - Supabase insert into journal_entries with kind='vent',
 *     privacy_level='private' on commit.
 *   - trackMilestone('first_vent_post') + emitMemberEvent('vent.created').
 *   - Redirects to /dashboard 1.5s after a successful save with a
 *     brief "Saved." status message.
 *   - InactivityGate mounted (30-min auto-logout with 5-min warning).
 *
 * Composition (the centered harbor vocabulary):
 *   - Top brand header — anchor + "Stone Harbor · Vent" on the left,
 *     "Edit profile · Sign out" on the right (matches /dashboard).
 *   - Anchor strip — "PRIVATE / Put it down here." instead of a bare
 *     centered title block.
 *   - Centered max-w-[720px] writing column matching journal's
 *     compose surface — serif italic textarea, same typography family
 *     so writing here looks like writing on /journal.
 *   - Horizon mark + "The harbor is patient." voice signature below
 *     the writing.
 *   - Crisis footer always visible via h-full layout pattern.
 *
 * Voice note:
 *   The horizon line stays "The harbor is patient." for visual
 *   consistency with /journal and /dashboard. Even though Vent is
 *   about release more than patience, the harbor's patience IS what
 *   makes it safe to release — the harbor doesn't keep score because
 *   it has the patience not to.
 */

type Mood = "angry" | "scared" | "sad" | "numb";

// Same mood palette the existing /vent uses. Hex colors are brand-
// fixed; mood LABELS resolve through useTranslations("vent") so they
// localize with the interface language.
const MOOD_OPTIONS: { value: Mood; color: string }[] = [
  { value: "angry", color: "#b14a3a" },
  { value: "scared", color: "#586558" },
  { value: "sad", color: "#5d6a85" },
  { value: "numb", color: "#7a7a78" },
];

const DRAFT_KEY = "stone-harbor:vent-draft";

export default function VentCenteredPage() {
  const t = useTranslations("vent");
  const router = useRouter();
  const { theme } = useTheme();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mood, setMood] = useState<Mood | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ───── Unsaved-changes guard ─────
  //
  // The member is "dirty" the moment they've typed any non-whitespace
  // content into the vent textarea. Mood-only state doesn't count as
  // dirty — selecting a mood without writing isn't work that would be
  // lost. Once dirty, useUnsavedChangesWarning intercepts ALL in-app
  // link clicks (Stone Harbor breadcrumb, mobile tab bar, anywhere
  // a Link is) plus tab close / refresh / external nav, and surfaces
  // showModal / cancel / confirm to the UnsavedChangesModal mounted
  // at the bottom of this page.
  const ventDirty = body.trim().length > 0;
  const ventUnsaved = useUnsavedChangesWarning(ventDirty);

  // Locale for the inline header/anchor copy (the rest of the page
  // uses t() through next-intl). Reads NEXT_LOCALE cookie so members
  // who switched to Spanish on a public surface get bilingual chrome
  // here too.
  const [locale, setLocale] = useState<"en" | "es">("en");
  useEffect(() => {
    const cookie = typeof document !== "undefined" ? document.cookie : "";
    const m = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookie);
    setLocale(m?.[1] === "es" ? "es" : "en");
  }, []);

  // Focus the textarea immediately on mount — frictionless dump entry,
  // same as the existing /vent.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Hydrate draft from localStorage on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        mood: Mood | null;
        body: string;
      };
      if (draft.mood) setMood(draft.mood);
      if (draft.body) setBody(draft.body);
    } catch {
      // Corrupted draft — start fresh.
    }
  }, []);

  // Debounced auto-save of the draft to localStorage on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (mood || body.trim()) {
        window.localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ mood, body }),
        );
      } else {
        window.localStorage.removeItem(DRAFT_KEY);
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [mood, body]);

  // Commit handler — identical insertion shape to /vent so the entry
  // threads into journal_entries the same way and downstream consumers
  // (Eidos events, milestone tracking) keep working unchanged.
  async function commitToJournal() {
    if (!body.trim()) return;
    setSaving(true);
    setSavedMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      setSavedMessage("Please sign in to save this entry.");
      return;
    }

    // Insert shape matches /journal's compose insert. journal_entries
    // has `content` (NOT NULL) and `original_content` (NOT NULL, the
    // immutable-original used by the 6-hour edit window). NO `body`,
    // `kind`, or `privacy_level` columns exist on the schema; vent
    // entries are distinguished from journal entries by title=null
    // (which they always are — vent has no title field). Same insert
    // shape as journal but without the title fields.
    //
    // Earlier revisions of this code wrote to `body`/`kind`/`privacy_level`
    // columns that don't exist — caused production save failures
    // ("could not find 'body' column of 'journal_entries' in schema
    // cache"). Verified against production schema 2026-06-18.
    const trimmedContent = body.trim();
    const { error } = await supabase.from("journal_entries").insert({
      user_id: user.id,
      content: trimmedContent,
      original_content: trimmedContent,
      mood: mood ?? null,
    });

    setSaving(false);

    if (error) {
      setSavedMessage(`Couldn't save right now: ${error.message}`);
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    trackMilestone("first_vent_post");

    const trimmedBody = body.trim();
    emitMemberEvent("vent.created", {
      mood: mood ?? null,
      length: trimmedBody.length,
      word_count: trimmedBody.split(/\s+/).filter(Boolean).length,
    });

    setBody("");
    setMood(null);
    setSavedMessage(t("statusSaved"));
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <>
    <div
      // Transparent wrapper — body's globals.css backdrop paints
      // through. h-full so crisis footer is permanently visible at
      // the bottom of the viewport.
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-hidden text-[var(--sh-text-primary)]`}
    >
      <InactivityGate />
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col">
        {/* ===== Top brand header ===== */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-[var(--sh-border-subtle)] px-10 py-6">
          {/* Brand cluster → /dashboard. Standard harbor-vocabulary
              pattern: "Stone Harbor" reads as the breadcrumb root and
              always points at /dashboard, the room hub. Unsaved-work
              protection sits at the DOM-click layer via
              useUnsavedChangesWarning + UnsavedChangesModal below — if
              the member has body content typed, the modal intercepts
              the click before navigation. */}
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
              {locale === "es" ? "Desahogo" : "Vent"}
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              href="/profile"
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
            >
              {locale === "es" ? "Editar perfil" : "Edit profile"}
            </Link>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              style={{ outline: "none", outlineOffset: 0 }}
              className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
            >
              {locale === "es" ? "Cerrar sesión" : "Sign out"}
            </button>
          </nav>
        </header>

        {/* ===== Anchor strip — page intention ===== */}
        <section className="flex flex-shrink-0 flex-col items-center border-b border-[var(--sh-border-subtle)] px-10 py-5">
          <p
            className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-accent-gold)]`}
          >
            {locale === "es" ? "Privado" : "Private"}
          </p>
          <p
            className={`${serif.className} mt-1.5 text-[20px] italic font-medium tracking-[-0.01em]`}
          >
            {t("title")}
          </p>
        </section>

        {/* ===== Main writing area ===== */}
        <main className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-10 pt-8">
            {/* Actions row — Save · Leave Draft, top-right.
                Matches journal compose's actions row exactly so the
                two writing surfaces feel like the same room. */}
            <div className="flex flex-shrink-0 justify-end gap-6">
              <button
                type="button"
                onClick={commitToJournal}
                disabled={saving || body.trim().length === 0}
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-accent-gold)] transition-colors hover:text-[var(--sh-accent-gold-bright)] disabled:opacity-50`}
              >
                {saving
                  ? t("saving")
                  : (locale === "es"
                      ? "Guardar en el diario"
                      : "Save to journal")}
              </button>
              <Link
                href="/dashboard"
                style={{ outline: "none", outlineOffset: 0 }}
                className={`${sans.className} text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-text-primary)]`}
              >
                {locale === "es" ? "Salir" : "Leave"}
              </Link>
            </div>

            {/* Mood chip row — same vocabulary as journal compose mood
                row. 4 chips for the vent's release moods (angry,
                scared, sad, numb) — Plutchik core + dissociation.
                Centered with serif eyebrow. */}
            <div className="mt-6 flex flex-shrink-0 flex-col items-center gap-3">
              <p
                className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--sh-text-tertiary)]`}
              >
                {t("moodGroupLabel")}
              </p>
              <div
                role="radiogroup"
                aria-label={t("moodGroupLabel")}
                className="flex flex-wrap justify-center gap-x-3.5 gap-y-2"
              >
                {MOOD_OPTIONS.map((opt) => {
                  const isSelected = mood === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() =>
                        setMood(isSelected ? null : opt.value)
                      }
                      style={{ outline: "none", outlineOffset: 0 }}
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                        isSelected
                          ? "bg-[rgba(196,147,78,0.08)]"
                          : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      <span
                        className={`${sans.className} text-[9px] font-semibold uppercase tracking-[0.22em]`}
                        style={{
                          color: isSelected
                            ? opt.color
                            : "var(--sh-text-tertiary)",
                        }}
                      >
                        {t(`moods.${opt.value}`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ───── Slate writing panel ─────
                The textarea sits inside a "slate panel" that gives the
                writing surface a different material feel from the
                journal's paper. The page chrome (header, anchor strip,
                horizon mark, mood chips, voice signature) all stay
                in the harbor vocabulary — only the writing zone shifts
                material.
                Composition:
                  - Theme-aware bg tint (cool slate on dusk, warm
                    slate-green on sunlit) sits over the body's
                    backdrop. The body's warm gradient + grain still
                    paint through; the panel just darkens/cools that
                    rectangle of the page.
                  - SVG noise overlay (chalk dust on dusk, graphite on
                    sunlit) — applied via a mask so the dust is denser
                    at the bottom of the panel, like chalk that has
                    settled.
                  - Inset shadow at the edges so the panel reads as
                    recessed into the page rather than floating on top.
                  - Faint hairlines at top + bottom — analog to the
                    engraved-gold hairlines on journal cards, but in
                    the slate's tonal language (cool-white on dusk,
                    graphite-grey on sunlit).
                Typography unchanged — serif italic 18px stays for
                consistency with journal compose. The page's literary
                voice doesn't change between rooms; only the material
                under the writing does. */}
            <div
              className="group relative mt-7 flex flex-1 flex-col overflow-hidden"
              style={{
                // Panel bg tuned: subtle enough that the slate is felt
                // rather than seen, but darker than fully subtle so it
                // reads as a distinct material from the page. The
                // light effects (noise, inset shadow, inner highlight,
                // gold hairlines on focus/hover) sit on top intact.
                backgroundColor:
                  theme === "dusk"
                    ? "rgba(20, 24, 32, 0.40)"
                    : "rgba(70, 85, 78, 0.040)",
                // Inset shadow tuned to match the slightly darker bg.
                // The 1px inner highlight (the "light effect" at the
                // panel edges) is kept at its original strength so the
                // panel still reads as having dimensional depth.
                boxShadow:
                  theme === "dusk"
                    ? "inset 0 0 40px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.04)"
                    : "inset 0 0 40px rgba(60, 50, 35, 0.08), inset 0 0 0 1px rgba(60, 50, 35, 0.07)",
              }}
            >
              {/* Noise overlay — chalk dust / graphite grain.
                  mask-image makes the texture denser at the bottom
                  of the panel (like chalk that has settled) and
                  fainter at the top. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    theme === "dusk"
                      ? "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.92  0 0 0 0 0.92  0 0 0 0 0.92  0 0 0 0.18 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"
                      : "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.30  0 0 0 0 0.27  0 0 0 0 0.22  0 0 0 0.20 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
                  backgroundSize: "240px 240px",
                  backgroundRepeat: "repeat",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,1) 100%)",
                  maskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,1) 100%)",
                }}
              />

              {/* Engraved-gold lens hairlines — active-state signal.
                  Identical shape and theme treatment to the journal's
                  EntryStripCard hairlines. Fade in when the cursor
                  hovers the panel (group-hover) OR when the textarea
                  has focus (group-focus-within, fires while the
                  member is typing). 300ms opacity transition matches
                  the cards' hairlines timing.
                  Slate hairlines (cool-white/graphite) were removed —
                  having two sets of horizontal lines at the same
                  edges would compete. The panel's bg + inset shadow
                  marks the boundary always; gold hairlines mark
                  active only. */}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
                <HairlineLens position="top" theme={theme} />
                <HairlineLens position="bottom" theme={theme} />
              </div>

              {/* Body textarea — same typography as journal compose
                  body. Padded inside the panel so the text doesn't
                  touch the slate's edges. Transparent bg, no border. */}
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("placeholder")}
                rows={12}
                style={{
                  outline: "none",
                  outlineOffset: 0,
                  padding: "20px 24px",
                }}
                className={`${serif.className} relative z-10 min-h-[260px] w-full flex-1 resize-none bg-transparent text-[18px] italic leading-[1.65] text-[var(--sh-text-secondary)] placeholder:text-[var(--sh-text-muted)]`}
              />
            </div>

            {/* Status / autosave indicator — quiet text at the bottom
                of the writing surface, above the horizon mark.
                mt-7 matches the mt-7 spacing above the slate panel
                (between mood chips and panel top edge), so the panel
                sits with equal breathing room above and below. */}
            <div className="mt-7 flex flex-shrink-0 justify-center pb-3">
              <p
                className={`${sans.className} text-[10px] uppercase tracking-[0.22em] text-[var(--sh-text-muted)]`}
              >
                {savedMessage ??
                  (body.trim()
                    ? t("statusAutosaving")
                    : t("statusNothing"))}
              </p>
            </div>
          </div>

          {/* ───── Horizon mark — visual close ───── */}
          <CenteredHorizonMark />
        </main>
      </div>
    </div>

    {/* Unsaved-changes guard — intercepts ALL in-app link clicks
        (Stone Harbor breadcrumb, mobile tab bar, anywhere a Link is)
        when the member has typed body content. The hook also handles
        tab close / refresh / external nav via beforeunload. Mounted
        but only renders when ventDirty triggers a click interception. */}
    <UnsavedChangesModal
      open={ventUnsaved.showModal}
      onStay={ventUnsaved.cancelNavigation}
      onLeave={ventUnsaved.confirmNavigation}
      bodyLabel="what you wrote"
    />
    </>
  );
}

// VentPanelHairline replaced with the shared `HairlineLens` from
// `app/components/hairlineLens.tsx` (2026-06-18 CSS sweep). Same
// geometry, identical theme treatment, no pixelation.

// ============================================================================
// Centered horizon mark — same component used on /journal + /dashboard.
// Once we have a shared component file, all three should import from it.
// ============================================================================

function CenteredHorizonMark() {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <div className="flex flex-shrink-0 flex-col items-center justify-center pb-6 pt-6">
      <motion.div
        animate={{ opacity: [0.78, 1, 0.78] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="flex w-3/4 max-w-[640px] items-center justify-center gap-3"
      >
        <HorizonSegment
          direction="left"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
        <motion.div
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "center" }}
        >
          <AnchorMark size={20} shaftHeight={42} fill="var(--sh-accent-gold)" />
        </motion.div>
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
      <p
        className={`${serif.className} mt-3 text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        The harbor is patient.
      </p>
    </div>
  );
}

// HorizonSegment moved to `app/components/horizonSegment.tsx` as part
// of the 2026-06-18 sweep to convert every harbor hairline to CSS.
