"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { serif, sans } from "@/lib/fonts";
import { cascadeFadeUp, cascadeTransition } from "@/lib/motion";
import { AnchorMark } from "@/app/components/anchorMark";
import { HorizonSegment } from "@/app/components/horizonSegment";
import { HairlineLens } from "@/app/components/hairlineLens";
import { useTheme } from "@/app/components/themeProvider";
import { InactivityGate } from "@/app/components/inactivityGate";
import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — /map shared chrome.
 *
 * The harbor-vocabulary composition pieces every /map surface (hub,
 * begin, week/[n], operating-manual) wears: the brand header, the
 * anchor strip, the horizon-mark divider, the voice signature, and the
 * text-link CTA affordance. Factored here so the four pages compose the
 * same vocabulary rather than re-declaring it.
 *
 * Ported from the pre-harbor /map (forced dark shell, PageAmbience +
 * PageTopNav, loud bordered gold buttons) to the composition
 * established by /journal and applied across every Phase-2 surface.
 */

// ───────────────────────────────────────────────────────────────────
// Auth guard — mirrors /journal exactly: getUser → /login, suspended
// profile → /suspended. Returns the resolved userId and a ready flag
// so each page can gate its own data-load on a confirmed session.
// ───────────────────────────────────────────────────────────────────
export function useHarborAuthGuard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("suspended_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.suspended_at) {
        router.replace("/suspended");
        return;
      }
      setUserId(user.id);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { userId, ready };
}

// ───────────────────────────────────────────────────────────────────
// Frame — outer page wrapper + InactivityGate + centered column +
// brand header. Pages render their <main> composition as children.
// ───────────────────────────────────────────────────────────────────
export function MapFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${sans.variable} ${serif.variable} h-full w-full overflow-y-auto text-[var(--sh-text-primary)]`}
    >
      {/* Parity with every other authenticated surface — Map sessions
          touch BFI-10 / BPNSFS-12 instruments and journal-style
          writing, so an idle tab on a shared device is a privacy gap. */}
      <InactivityGate />
      <div className="mx-auto flex min-h-full w-full max-w-[1440px] flex-col">
        <MapHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Brand header — AnchorMark + "Stone Harbor · Map", language picker +
// sign-out in the utility slot. Matches /journal's brand header.
// ───────────────────────────────────────────────────────────────────
function MapHeader() {
  const t = useTranslations("map");

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
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
          {t("brandCrumb")}
        </span>
      </Link>

      <nav className="flex items-center gap-6">
        <button
          type="button"
          onClick={signOut}
          style={{ outline: "none", outlineOffset: 0 }}
          className={`${sans.className} text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--sh-text-tertiary)] transition-colors hover:text-[var(--sh-accent-gold)]`}
        >
          {t("signOut")}
        </button>
      </nav>
    </header>
  );
}

// ───────────────────────────────────────────────────────────────────
// Anchor strip — the page's intention. Centered eyebrow / serif italic
// title / optional support line. First cascade beat after the header.
// ───────────────────────────────────────────────────────────────────
export function MapAnchorStrip({
  eyebrow,
  title,
  support,
}: {
  eyebrow: string;
  title: string;
  support?: string;
}) {
  return (
    <motion.section
      {...cascadeFadeUp}
      transition={cascadeTransition(0)}
      className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 pt-12 text-center md:px-10"
    >
      <p
        className={`${sans.className} text-[10px] font-bold uppercase tracking-[0.36em] text-[var(--sh-accent-gold)]`}
      >
        {eyebrow}
      </p>
      <h1
        className={`${serif.className} mt-3 text-4xl font-medium italic leading-tight tracking-[-0.01em] text-[var(--sh-text-primary)] md:text-5xl`}
      >
        {title}
      </h1>
      {support && (
        <p
          className={`${sans.className} mt-6 max-w-prose text-base leading-relaxed text-[var(--sh-text-secondary)] md:text-lg`}
        >
          {support}
        </p>
      )}
    </motion.section>
  );
}

// ───────────────────────────────────────────────────────────────────
// Horizon-mark divider — the engraved-gold rule + breathing anchor
// that separates the anchor strip from the body. Replaces the old
// `h-px w-16 bg-[#c4934e]` rule. Second cascade beat.
// ───────────────────────────────────────────────────────────────────
export function MapHorizonMark() {
  const { theme } = useTheme();
  const goldRgb = theme === "sunlit" ? "169,121,61" : "196,147,78";
  const goldHex = theme === "sunlit" ? "#a9793d" : "#c4934e";
  const filterShadow =
    theme === "sunlit"
      ? "drop-shadow(0 0.5px 0 rgba(60,40,15,0.18))"
      : "drop-shadow(0 0 3px rgba(196,147,78,0.35)) drop-shadow(0 0 6px rgba(196,147,78,0.18))";
  const lineAlphaInner = theme === "sunlit" ? 0.95 : 0.85;
  const lineAlphaMid = theme === "sunlit" ? 0.5 : 0.4;

  return (
    <motion.div
      {...cascadeFadeUp}
      transition={cascadeTransition(1)}
      className="flex flex-shrink-0 flex-col items-center justify-center py-10"
    >
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
          <AnchorMark size={20} shaftHeight={42} fill={goldHex} />
        </motion.div>
        <HorizonSegment
          direction="right"
          goldRgb={goldRgb}
          lineAlphaInner={lineAlphaInner}
          lineAlphaMid={lineAlphaMid}
          filter={filterShadow}
        />
      </motion.div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Voice signature — the quiet italic line at the foot of every /map
// surface. The harbor is one entity across surfaces; the copy varies
// per page but the treatment is constant.
// ───────────────────────────────────────────────────────────────────
export function MapVoiceSignature({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      {...cascadeFadeUp}
      transition={cascadeTransition(step)}
      className="flex flex-shrink-0 flex-col items-center px-6 pb-12 pt-8 text-center"
    >
      <p
        className={`${serif.className} text-[14px] italic text-[var(--sh-text-tertiary)]`}
      >
        {children}
      </p>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────
// Text-link CTA — the harbor's primary-action affordance. Replaces
// every loud bordered gold button. Paired HairlineLens fades in on
// hover / keyboard focus; the loading state dims the label, drops the
// arrow, and suppresses the hairlines.
// ───────────────────────────────────────────────────────────────────
function ctaClasses(loading: boolean, disabled: boolean) {
  const base =
    "group relative inline-flex items-baseline gap-2 px-2 py-2 text-sm font-medium uppercase tracking-[0.18em] transition-colors focus:outline-none";
  if (loading) return `${base} cursor-wait text-[var(--sh-text-tertiary)]`;
  if (disabled)
    return `${base} cursor-not-allowed text-[var(--sh-text-tertiary)] opacity-50`;
  return `${base} text-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold-bright)] focus-visible:text-[var(--sh-accent-gold-bright)]`;
}

function CtaHairlines({ theme }: { theme: "sunlit" | "dusk" }) {
  return (
    <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
      <HairlineLens position="top" theme={theme} />
      <HairlineLens position="bottom" theme={theme} />
    </span>
  );
}

export function MapActionButton({
  label,
  loadingLabel,
  onClick,
  loading = false,
  disabled = false,
}: {
  label: string;
  /** Optional label shown in place of `label` while loading (e.g.
   *  "Beginning…"). When omitted, the label stays and simply dims. */
  loadingLabel?: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const inert = loading || disabled;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={inert}
      className={ctaClasses(loading, disabled)}
    >
      {loading && loadingLabel ? loadingLabel : label}
      {!inert && <span aria-hidden>→</span>}
      {!inert && <CtaHairlines theme={theme} />}
    </button>
  );
}

export function MapActionLink({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  const { theme } = useTheme();
  return (
    <Link href={href} className={ctaClasses(false, false)}>
      {label}
      <span aria-hidden>→</span>
      <CtaHairlines theme={theme} />
    </Link>
  );
}

// ───────────────────────────────────────────────────────────────────
// Loading — quiet centered note while a surface's state is in flight.
// Matches /journal's loading treatment.
// ───────────────────────────────────────────────────────────────────
export function MapLoading({ label }: { label: string }) {
  return (
    <div
      className={`${sans.variable} ${serif.variable} flex h-full w-full items-center justify-center text-[var(--sh-text-primary)]`}
    >
      <p
        className={`${serif.className} text-[16px] italic text-[var(--sh-text-tertiary)]`}
      >
        {label}
      </p>
    </div>
  );
}
