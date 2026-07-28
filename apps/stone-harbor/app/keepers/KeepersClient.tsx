"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { serif, sans } from "@/lib/fonts";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/app/components/themeProvider";
import { HairlineLens } from "@/app/components/hairlineLens";
import { Lighthouse } from "@/app/components/icons";

/**
 * Stone Harbor — /keepers client surface (SH-108, brief §7).
 *
 * Resolves the member-aware variant client-side (see page.tsx note):
 *   - prospect  → not signed in, or patron_status 'none'/null
 *   - active    → patron_status 'active'
 *   - lapsed    → patron_status 'canceled' | 'past_due'
 *
 * Copy is entirely from the `keepers` i18n namespace (verbatim founder
 * copy, brief §3–§7). Voice: no urgency, no exclamation, em-dashes.
 *
 * NOTE (scaffold): the visual treatment here is on-brand (cream/Dusk via
 * --sh-* tokens, serif/sans, Lighthouse hero, HairlineLens separators,
 * hairline-top tier cards with a farol hover) but a design polish pass to
 * pixel-match /roadmap step cards is still worthwhile before launch.
 */

type PatronStatus = "none" | "active" | "past_due" | "canceled";
type Tier = "tier_1" | "tier_2" | "tier_3";

type PatronState = {
  status: PatronStatus;
  tier: Tier | null;
  since: string | null;
};

const TIER_KEYS: Tier[] = ["tier_1", "tier_2", "tier_3"];
const TIER_AMOUNT: Record<Tier, string> = {
  tier_1: "$10",
  tier_2: "$25",
  tier_3: "$100",
};

export function KeepersClient() {
  const t = useTranslations("keepers");
  const locale = useLocale();
  const { theme } = useTheme();
  const themeName = (theme === "dusk" ? "dusk" : "sunlit") as "sunlit" | "dusk";
  const searchParams = useSearchParams();
  const canceled = searchParams.get("checkout") === "canceled";

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [patron, setPatron] = useState<PatronState>({ status: "none", tier: null, since: null });
  const [wallNames, setWallNames] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Load session + patron state.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session ?? null;
      if (session?.user) {
        if (alive) setToken(session.access_token);
        const { data: profile } = await supabase
          .from("profiles")
          .select("patron_status, patron_tier, patron_since")
          .eq("id", session.user.id)
          .maybeSingle();
        if (alive && profile) {
          setPatron({
            status: (profile.patron_status as PatronStatus) ?? "none",
            tier: (profile.patron_tier as Tier | null) ?? null,
            since: (profile.patron_since as string | null) ?? null,
          });
        }
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load the opt-in wall (public endpoint).
  useEffect(() => {
    let alive = true;
    fetch("/api/keepers/wall")
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((d: { names?: string[] }) => {
        if (alive) setWallNames(Array.isArray(d.names) ? d.names : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const authHeaders = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const startCheckout = useCallback(
    async (body: { mode: "subscription" | "payment"; tier?: Tier; amountCents?: number }) => {
      const key = body.tier ?? `payment:${body.amountCents}`;
      setBusy(key);
      try {
        const res = await fetch("/api/checkout/session", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ ...body, locale }),
        });
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      } catch {
        /* fall through */
      }
      setBusy(null);
    },
    [authHeaders, locale],
  );

  const openPortal = useCallback(async () => {
    setBusy("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", headers: authHeaders });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      /* fall through */
    }
    setBusy(null);
  }, [authHeaders]);

  const variant: "prospect" | "active" | "lapsed" = useMemo(() => {
    if (patron.status === "active") return "active";
    if (patron.status === "canceled" || patron.status === "past_due") return "lapsed";
    return "prospect";
  }, [patron.status]);

  const sinceLabel = useMemo(() => {
    if (!patron.since) return "";
    try {
      return new Date(patron.since).toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
        month: "long",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }, [patron.since, locale]);

  return (
    <main
      className={`${sans.className} relative min-h-screen bg-[var(--sh-bg-page)] px-4 py-14 text-[var(--sh-text-primary)] md:px-8 md:py-20`}
    >
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <header className="text-center">
          <div className="mb-6 flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--sh-text-tertiary)]">
            <span>Stone Harbor</span>
            <span aria-hidden="true" className="opacity-40">·</span>
            <span>{t("brandCrumb")}</span>
          </div>
          <Lighthouse
            size={40}
            strokeWidth={1.5}
            className="mx-auto mb-6 text-[var(--sh-accent-gold)]"
          />
          <h1 className={`${serif.className} text-3xl leading-tight md:text-4xl`}>
            {variant === "active"
              ? t("activePatron.eyebrow")
              : variant === "lapsed"
                ? t("lapsedPatron.title")
                : t("hero.title")}
          </h1>
        </header>

        {canceled && variant !== "active" && (
          <p className="mx-auto mt-6 max-w-xl rounded-md border border-[var(--sh-border-subtle)] bg-[var(--sh-bg-card-tinted-hover)] px-4 py-3 text-center text-sm leading-relaxed text-[var(--sh-text-secondary)]">
            {t("canceledNotice")}
          </p>
        )}

        {!ready ? (
          <p className="mt-16 text-center text-sm text-[var(--sh-text-tertiary)]">…</p>
        ) : variant === "active" ? (
          <ActivePatron
            t={t}
            amount={patron.tier ? TIER_AMOUNT[patron.tier] : ""}
            since={sinceLabel}
            onManage={openPortal}
            busy={busy === "portal"}
          />
        ) : (
          <>
            {variant === "lapsed" && (
              <p className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-[var(--sh-text-secondary)]">
                {t("lapsedPatron.body")}
              </p>
            )}

            {variant === "prospect" && (
              <p className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-[var(--sh-text-secondary)]">
                {t("hero.framing")}
              </p>
            )}

            {/* Legal disclosure — prose, above the tier picker (brief §6). */}
            <p className="mx-auto mt-10 max-w-xl text-center text-sm leading-relaxed text-[var(--sh-text-tertiary)]">
              {t("legal.body")}
            </p>

            {/* Three monthly tiers */}
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {TIER_KEYS.map((tier) => (
                <TierCard
                  key={tier}
                  eyebrow={t(`tiers.${tier}.eyebrow`)}
                  price={t(`tiers.${tier}.price`)}
                  body={t(`tiers.${tier}.body`)}
                  cta={t(`tiers.${tier}.cta`)}
                  busy={busy === tier}
                  themeName={themeName}
                  onClick={() => startCheckout({ mode: "subscription", tier })}
                />
              ))}
            </div>

            {/* One-time */}
            <div className="relative mt-14 pt-14">
              <HairlineLens position="top" theme={themeName} />
              <OneTimePanel t={t} busy={busy?.startsWith("payment:") ?? false} onGive={(cents) => startCheckout({ mode: "payment", amountCents: cents })} />
            </div>
          </>
        )}

        {/* Wall of first-names — only when at least one visible patron. */}
        {wallNames.length > 0 && (
          <section className="relative mt-16 pt-14">
            <HairlineLens position="top" theme={themeName} />
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sh-text-tertiary)]">
              {t("wall.eyebrow")}
            </p>
            <p className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-[var(--sh-text-secondary)]">
              {t("wall.description")}
            </p>
            <p
              className={`${serif.className} mx-auto mt-8 max-w-xl text-center text-lg leading-loose text-[var(--sh-text-primary)]`}
            >
              {wallNames.join(" · ")}
            </p>
          </section>
        )}

        {/* Voice signature */}
        <p
          className={`${serif.className} mt-16 text-center text-base italic text-[var(--sh-text-tertiary)]`}
        >
          {t("voiceSignature")}
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------

function TierCard({
  eyebrow,
  price,
  body,
  cta,
  onClick,
  busy,
  themeName,
}: {
  eyebrow: string;
  price: string;
  body: string;
  cta: string;
  onClick: () => void;
  busy: boolean;
  themeName: "sunlit" | "dusk";
}) {
  return (
    <div className="group relative flex flex-col rounded-lg bg-transparent p-5 transition-colors hover:bg-[var(--sh-bg-card-tinted-hover)]">
      <HairlineLens position="top" theme={themeName} />
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--sh-text-tertiary)]">
        {eyebrow}
      </p>
      <p className={`${serif.className} mt-2 text-xl text-[var(--sh-text-primary)]`}>{price}</p>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--sh-text-secondary)]">{body}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="mt-5 rounded-md border border-[var(--sh-accent-gold)] px-4 py-2 text-sm font-semibold text-[var(--sh-accent-gold)] transition hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-50"
      >
        {busy ? "…" : cta}
      </button>
    </div>
  );
}

function OneTimePanel({
  t,
  onGive,
  busy,
}: {
  t: ReturnType<typeof useTranslations>;
  onGive: (cents: number) => void;
  busy: boolean;
}) {
  const chips = (t.raw("oneTime.chips") as number[]) ?? [10, 25, 100, 250];
  const [dollars, setDollars] = useState<string>("");

  const cents = Math.round(parseFloat(dollars || "0") * 100);
  const valid = Number.isFinite(cents) && cents >= 100;

  return (
    <div className="mx-auto max-w-xl text-center">
      <p className={`${serif.className} text-2xl text-[var(--sh-text-primary)]`}>{t("oneTime.title")}</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--sh-text-secondary)]">
        {t("oneTime.body")}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setDollars(String(c))}
            className="rounded-full border border-[var(--sh-border-subtle)] px-4 py-1.5 text-sm text-[var(--sh-text-secondary)] transition hover:border-[var(--sh-accent-gold)] hover:text-[var(--sh-accent-gold)]"
          >
            ${c}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-5 flex max-w-xs items-center gap-2">
        <label className="sr-only" htmlFor="oneTimeAmount">
          {t("oneTime.amountLabel")}
        </label>
        <span className="text-[var(--sh-text-tertiary)]">$</span>
        <input
          id="oneTimeAmount"
          type="number"
          min={1}
          step="1"
          inputMode="decimal"
          placeholder={t("oneTime.amountLabel")}
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          className="w-full rounded-md border border-[var(--sh-border-subtle)] bg-transparent px-3 py-2 text-[var(--sh-text-primary)] outline-none focus:border-[var(--sh-accent-gold)]"
        />
      </div>

      <button
        type="button"
        disabled={!valid || busy}
        onClick={() => onGive(cents)}
        className="mt-5 rounded-md border border-[var(--sh-accent-gold)] px-5 py-2 text-sm font-semibold text-[var(--sh-accent-gold)] transition hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-40"
      >
        {busy ? "…" : t("oneTime.cta")}
      </button>
    </div>
  );
}

function ActivePatron({
  t,
  amount,
  since,
  onManage,
  busy,
}: {
  t: ReturnType<typeof useTranslations>;
  amount: string;
  since: string;
  onManage: () => void;
  busy: boolean;
}) {
  return (
    <div className="mx-auto mt-8 max-w-xl text-center">
      <p className="text-base leading-relaxed text-[var(--sh-text-secondary)]">
        {t("activePatron.body", { since, amount })}
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onManage}
          disabled={busy}
          className="rounded-md border border-[var(--sh-accent-gold)] px-5 py-2 text-sm font-semibold text-[var(--sh-accent-gold)] transition hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-50"
        >
          {busy ? "…" : t("activePatron.manageCta")}
        </button>
        <button
          type="button"
          onClick={onManage}
          disabled={busy}
          className="text-sm text-[var(--sh-text-tertiary)] underline underline-offset-4 transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50"
        >
          {t("activePatron.changeTierCta")}
        </button>
      </div>
    </div>
  );
}
