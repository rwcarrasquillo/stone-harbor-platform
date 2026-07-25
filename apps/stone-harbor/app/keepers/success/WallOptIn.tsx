"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { supabase } from "@/lib/supabaseClient";

/**
 * Stone Harbor — wall opt-in prompt on /keepers/success (brief §5.3).
 *
 * Only shown to a signed-in member — a non-member has no profile to link
 * a wall name to. Default is NO: the member must explicitly choose "Yes"
 * to appear. "Later" simply dismisses without a write.
 */

type Phase = "loading" | "hidden" | "prompt" | "saved";

export function WallOptIn() {
  const t = useTranslations("keepers.success.wallOptIn");
  const [phase, setPhase] = useState<Phase>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (!alive) return;
      if (session?.user) {
        setToken(session.access_token);
        setPhase("prompt");
      } else {
        // Not signed in → nothing to link to; no prompt (brief §8.5).
        setPhase("hidden");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function choose(visible: boolean) {
    if (!token) return;
    setBusy(true);
    try {
      await fetch("/api/keepers/wall-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visible }),
      });
    } catch {
      /* best-effort — the patron can revisit from the portal/support */
    }
    setPhase("saved");
    setBusy(false);
  }

  if (phase === "loading" || phase === "hidden" || phase === "saved") {
    return null;
  }

  return (
    <div className="mt-10">
      <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--sh-text-secondary)]">
        {t("prompt")}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(true)}
          className="rounded-md border border-[var(--sh-accent-gold)] px-4 py-2 text-sm font-semibold text-[var(--sh-accent-gold)] transition hover:bg-[var(--sh-accent-gold)] hover:text-[var(--sh-bg-page)] disabled:opacity-50"
        >
          {t("yes")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(false)}
          className="rounded-md border border-[var(--sh-border-subtle)] px-4 py-2 text-sm text-[var(--sh-text-secondary)] transition hover:border-[var(--sh-accent-gold)] disabled:opacity-50"
        >
          {t("no")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setPhase("saved")}
          className="text-sm text-[var(--sh-text-tertiary)] underline underline-offset-4 transition hover:text-[var(--sh-accent-gold)] disabled:opacity-50"
        >
          {t("later")}
        </button>
      </div>
    </div>
  );
}
