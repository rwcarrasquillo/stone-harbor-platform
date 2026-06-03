"use client";

/**
 * Stone Harbor — Founder-only story prompt admin view (MVP).
 *
 * Read-only table of every prompt in the Dad pool with aggregate
 * engagement stats. Lives inside the member app because the
 * standalone admin app hasn't been ported yet for the Story Series.
 *
 * When M2 (therapist beta) opens the series to ~20 men, this view
 * will move into the admin app and gain editing affordances. For now
 * it's a single founder-only page with three goals:
 *
 *   1. Confirm the 36 prompts are in DB and active.
 *   2. Show first-pass engagement: shown / answered / skipped counts.
 *   3. Show median writing seconds + average word count so the
 *      surfacer's editorial bias can be sanity-checked against
 *      actual behavior.
 *
 * Gate: founder email. Anyone else is bounced to /dashboard.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";
import { serif } from "@/lib/fonts";
import { useTheme } from "@/app/components/themeProvider";
import { PageAmbience } from "@/app/components/pageAmbience";
import { isFounderEmail } from "@/lib/story";

type PromptRow = {
  id: string;
  series_slug: string;
  depth: number;
  themes: string[];
  prompt_text: string;
  est_minutes: number | null;
  re_surface_eligible: boolean;
  active: boolean;
  order_hint: number | null;
};

type InvitationRow = {
  prompt_id: string;
  status: string;
  telemetry: {
    total_writing_seconds?: number;
    word_count?: number;
  } | null;
};

type AggregatedRow = PromptRow & {
  shown: number;
  answered: number;
  skipped: number;
  pending: number;
  median_writing_seconds: number | null;
  avg_word_count: number | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export default function FounderStoryPromptsPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDusk = theme === "dusk";

  const [authChecked, setAuthChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [depthFilter, setDepthFilter] = useState<"all" | 1 | 2 | 3 | 4>("all");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user || !isFounderEmail(user.email)) {
        router.replace("/dashboard");
        return;
      }
      setAllowed(true);
      setAuthChecked(true);

      const [{ data: pData }, { data: iData }] = await Promise.all([
        supabase
          .from("story_prompts")
          .select(
            "id, series_slug, depth, themes, prompt_text, est_minutes, re_surface_eligible, active, order_hint",
          )
          .eq("consumer_slug", "stone_harbor")
          .eq("language", "en")
          .order("depth", { ascending: true })
          .order("order_hint", { ascending: true }),
        supabase
          .from("member_story_invitations")
          .select("prompt_id, status, telemetry"),
      ]);

      if (cancelled) return;
      setPrompts((pData ?? []) as PromptRow[]);
      setInvitations((iData ?? []) as InvitationRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const rows: AggregatedRow[] = useMemo(() => {
    const byPromptId = new Map<string, InvitationRow[]>();
    for (const inv of invitations) {
      const list = byPromptId.get(inv.prompt_id) ?? [];
      list.push(inv);
      byPromptId.set(inv.prompt_id, list);
    }
    return prompts
      .filter((p) => depthFilter === "all" || p.depth === depthFilter)
      .map((p) => {
        const invs = byPromptId.get(p.id) ?? [];
        const shown = invs.length;
        const answered = invs.filter((i) => i.status === "answered").length;
        const skipped = invs.filter((i) => i.status === "skipped").length;
        const pending = invs.filter((i) => i.status === "pending").length;
        const writingSecs = invs
          .map((i) => i.telemetry?.total_writing_seconds)
          .filter((n): n is number => typeof n === "number" && n > 0);
        const wordCounts = invs
          .map((i) => i.telemetry?.word_count)
          .filter((n): n is number => typeof n === "number" && n > 0);
        return {
          ...p,
          shown,
          answered,
          skipped,
          pending,
          median_writing_seconds: median(writingSecs),
          avg_word_count: average(wordCounts),
        };
      });
  }, [prompts, invitations, depthFilter]);

  if (!authChecked) {
    return (
      <main className="min-h-screen">
        <PageAmbience />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className={isDusk ? "text-stone-300" : "text-stone-600"}>
            Checking access…
          </p>
        </div>
      </main>
    );
  }

  if (!allowed) return null;

  return (
    <main className="min-h-screen pb-32">
      <PageAmbience />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p
          className={`mb-2 text-[10px] font-bold uppercase tracking-[0.32em] ${
            isDusk ? "text-[#c4934e]" : "text-[#a9793d]"
          }`}
        >
          Founder
        </p>
        <h1
          className={`${serif.className} mb-6 text-3xl italic md:text-4xl ${
            isDusk ? "text-stone-100" : "text-stone-900"
          }`}
        >
          Story Series — Dad Pool
        </h1>
        <p
          className={`mb-8 max-w-3xl text-sm ${
            isDusk ? "text-stone-400" : "text-stone-600"
          }`}
        >
          Read-only view of the 36 prompts and their aggregate engagement.
          Counts include every member with active invitations — during the
          M1 founder gate, that&apos;s only this account.
        </p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span
            className={`text-[10px] font-bold uppercase tracking-[0.22em] ${
              isDusk ? "text-stone-400" : "text-stone-600"
            }`}
          >
            Depth
          </span>
          {(["all", 1, 2, 3, 4] as const).map((d) => {
            const active = depthFilter === d;
            return (
              <button
                key={String(d)}
                type="button"
                onClick={() => setDepthFilter(d)}
                className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] transition ${
                  active
                    ? isDusk
                      ? "border-[#c4934e] bg-[#c4934e] text-stone-900"
                      : "border-[#a9793d] bg-[#a9793d] text-stone-50"
                    : isDusk
                      ? "border-white/20 text-stone-300 hover:bg-white/5"
                      : "border-stone-300 text-stone-700 hover:bg-stone-100"
                }`}
              >
                {d === "all" ? "All" : `L${d}`}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className={isDusk ? "text-stone-400" : "text-stone-600"}>
            Loading prompts…
          </p>
        ) : (
          <div
            className={`overflow-x-auto border ${
              isDusk ? "border-white/10" : "border-stone-200"
            }`}
          >
            <table
              className={`w-full text-left text-sm ${
                isDusk ? "text-stone-200" : "text-stone-800"
              }`}
            >
              <thead
                className={`text-[10px] uppercase tracking-[0.22em] ${
                  isDusk ? "bg-black/30 text-stone-400" : "bg-stone-50 text-stone-500"
                }`}
              >
                <tr>
                  <th className="px-3 py-2">L</th>
                  <th className="px-3 py-2">Prompt</th>
                  <th className="px-3 py-2">Themes</th>
                  <th className="px-3 py-2 text-right">Est</th>
                  <th className="px-3 py-2 text-right">Shown</th>
                  <th className="px-3 py-2 text-right">Ans</th>
                  <th className="px-3 py-2 text-right">Skip</th>
                  <th className="px-3 py-2 text-right">Med sec</th>
                  <th className="px-3 py-2 text-right">Avg words</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t align-top ${
                      isDusk ? "border-white/10" : "border-stone-200"
                    }`}
                  >
                    <td className="px-3 py-3 font-bold">L{r.depth}</td>
                    <td className="px-3 py-3 max-w-xl">{r.prompt_text}</td>
                    <td className="px-3 py-3 text-xs">
                      {r.themes.join(", ")}
                    </td>
                    <td className="px-3 py-3 text-right">{r.est_minutes ?? "—"}</td>
                    <td className="px-3 py-3 text-right">{r.shown}</td>
                    <td className="px-3 py-3 text-right">{r.answered}</td>
                    <td className="px-3 py-3 text-right">{r.skipped}</td>
                    <td className="px-3 py-3 text-right">
                      {r.median_writing_seconds ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.avg_word_count ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p
          className={`mt-8 text-xs italic ${
            isDusk ? "text-stone-500" : "text-stone-500"
          }`}
        >
          Temporary surface inside the member app. Moves to the admin
          app at M2 (therapist beta).
        </p>
      </div>
    </main>
  );
}
