// apps/stone-harbor/supabase/functions/psychologist/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — psychologist (SH-87, DRAFT — NOT YET DEPLOYED).
 *
 * The 5th, slowest-cadence editorial agent. It does NOT write letters and does
 * NOT gate quality. Once per quarter (or on demand) it reads the editorial
 * canon, the library's score patterns, the Critic-pass failures, sample
 * letters, and a publish-rate proxy, optionally consults peer-reviewed
 * psychology research via allowlist-scoped web search/fetch, and PROPOSES
 * refinements to the canon. Every proposal is pending until the founder
 * approves it in the admin — nothing here auto-applies.
 *
 * Request body:
 *   { trigger?: "manual" | "cron", force?: boolean }
 *
 * Cron path skips when psychologist_quarterly_enabled = false, or when
 * psychologist_last_run_at is within 30 days (unless force=true).
 *
 * Model: Opus 4.8 (deep reasoning). NOTE the API surface differs from the
 * Sonnet blog functions: Opus 4.8 rejects temperature/top_p (we never send
 * them), uses adaptive thinking + effort, and runs a server-side tool loop
 * that can return stop_reason "pause_turn" (we resume it).
 *
 * The allowlist is enforced at the API level via the web tools' allowed_domains
 * — a far stronger guarantee than a prompt instruction. Citations are then
 * re-validated host-by-host after generation; the model's self-report is not
 * trusted on its own.
 *
 * Persists to psychologist_runs + psychologist_proposals (see
 * psychologist_001_schema.sql). Logs to ai_usage_log under task
 * "psychologist", called_from "edge:psychologist".
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Mirror of Stone_Harbor_Harbor_Voice.md §3 — the harbor's "never does" list.
// Injected so the agent can't fetch the Voice doc but still respects it. Keep
// this in sync with §3 if the doc changes.
const VOICE_NEVER_LIST = [
  "Never quantify selfhood or reduce the reader to a number.",
  "Never count streaks, days, or progress metrics.",
  "Never perform urgency or manufacture stakes.",
  "Never diagnose the reader or label them clinically.",
  "Never remind the reader that they are broken, damaged, or in deficit.",
  "Never prescribe exercises, steps, or instructions — the harbor witnesses, it does not instruct.",
  "Never name the therapeutic modality (embody the frame, never cite it).",
].join("\n");

const ALLOWED_PROPOSAL_TYPES = new Set([
  "embodiment_refinement",
  "substrate_refinement",
  "new_angle",
  "retirement",
  "pillar_recommendation",
]);
const CITATION_REQUIRED_TYPES = new Set(["substrate_refinement", "new_angle"]);
const ALLOWED_CONFIDENCE = new Set(["well_validated", "emerging", "contested"]);

function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

// deno-lint-ignore no-explicit-any
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

/** Host is allowed if it equals or is a subdomain of an allowlist entry. */
function hostAllowed(host: string, allowlist: string[]): boolean {
  return allowlist.some((d) => {
    const dom = d.toLowerCase();
    return host === dom || host.endsWith("." + dom);
  });
}

/** Pull the first balanced {...} JSON object out of the model's text. */
// deno-lint-ignore no-explicit-any
function extractJson(raw: string): any {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) {
    throw new Error("Model output had no JSON object: " + text.slice(0, 200));
  }
  return JSON.parse(text.slice(first, last + 1));
}

type AnthropicResult = {
  text: string;
  input_tokens: number;
  output_tokens: number;
  stop_reason: string;
};

/**
 * Call the Messages API with allowlist-scoped web tools, adaptive thinking, and
 * effort, resuming the server-side tool loop on stop_reason "pause_turn".
 * No temperature/top_p — those 400 on Opus 4.8.
 */
async function runAgent(
  apiKey: string, model: string, system: string, user: string,
  allowlist: string[], maxTokens: number, maxContinuations = 6,
): Promise<AnthropicResult> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = [{ role: "user", content: user }];
  let inTok = 0, outTok = 0;

  for (let i = 0; i < maxContinuations; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            allowed_domains: allowlist,
            max_uses: 12,
          },
          {
            type: "web_fetch_20260209",
            name: "web_fetch",
            allowed_domains: allowlist,
            max_uses: 8,
            citations: { enabled: true },
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const body = await res.json();
    inTok += body.usage?.input_tokens ?? 0;
    outTok += body.usage?.output_tokens ?? 0;

    if (body.stop_reason === "refusal") {
      throw new Error("Anthropic refusal: " + JSON.stringify(body.stop_details ?? {}));
    }
    if (body.stop_reason === "pause_turn") {
      // Server-side tool loop hit its iteration cap — resume by echoing the
      // assistant turn back and re-sending (no extra user message).
      messages.push({ role: "assistant", content: body.content });
      continue;
    }

    // Final turn: concatenate text blocks (skip thinking / tool_use / results).
    // deno-lint-ignore no-explicit-any
    const text = (body.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    return { text, input_tokens: inTok, output_tokens: outTok, stop_reason: body.stop_reason };
  }
  throw new Error("Exceeded pause_turn continuations without a final answer");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!supabaseUrl || !serviceKey || !anthropicKey) {
    return new Response(JSON.stringify({ error: "Missing SUPABASE/ANTHROPIC env" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let trigger: "manual" | "cron" = "manual";
  let force = false;
  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (b?.trigger === "cron") trigger = "cron";
      force = b?.force === true;
    } catch (_) { /* defaults */ }
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Settings + cadence gate ────────────────────────────────────────────────
  const { data: settings } = await supabase
    .from("admin_settings")
    .select(
      "ai_models, ai_pricing, psychologist_source_allowlist, psychologist_quarterly_enabled, psychologist_last_run_at",
    )
    .eq("id", 1)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const s = (settings ?? {}) as any;
  const allowlist: string[] = Array.isArray(s.psychologist_source_allowlist)
    ? s.psychologist_source_allowlist
    : [];
  const model: string = s.ai_models?.psychologist?.anthropic ?? "claude-opus-4-8";

  if (trigger === "cron" && !force) {
    if (s.psychologist_quarterly_enabled !== true) {
      return new Response(JSON.stringify({ status: "skipped", reason: "quarterly disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (s.psychologist_last_run_at) {
      const days = (Date.now() - new Date(s.psychologist_last_run_at).getTime()) / 86_400_000;
      if (days < 30) {
        return new Response(JSON.stringify({ status: "skipped", reason: `ran ${Math.floor(days)}d ago` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }
  if (allowlist.length === 0) {
    return new Response(JSON.stringify({ error: "psychologist_source_allowlist is empty" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Open the run row (the run_id the agent must echo back) ──────────────────
  const { data: runRow, error: runErr } = await supabase
    .from("psychologist_runs")
    .insert({ triggered_by: trigger, status: "running", model, provider: "anthropic" })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return new Response(JSON.stringify({ error: `run insert failed: ${runErr?.message}` }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = (runRow as { id: string }).id;

  try {
    // ── Gather the canon-review data set ─────────────────────────────────────
    const { data: angles } = await supabase
      .from("editorial_canon_angles")
      .select("id, pillar, angle_name, harbor_framing, therapeutic_substrate, therapeutic_substrate_es, embodiment_instruction, embodiment_instruction_es, is_active, created_at, display_order")
      .order("pillar").order("display_order");
    const { data: scores } = await supabase
      .from("blog_draft_scores")
      .select("post_id, language, overall_score, scales");
    const { data: assigns } = await supabase
      .from("editorial_assignments")
      .select("post_id, language, angle_id")
      .eq("succeeded", true).not("post_id", "is", null);
    const { data: recentTr } = await supabase
      .from("blog_post_translations")
      .select("post_id, language, title, content, blog_posts:post_id!inner(pillar, is_published)")
      .order("created_at", { ascending: false })
      .limit(24);
    const { data: failed } = await supabase
      .from("blog_failed_drafts")
      .select("angle_id, language, attempt_number, failure_reason, critic_overall_score, critic_scales, failed_at")
      .order("failed_at", { ascending: false })
      .limit(40);

    // deno-lint-ignore no-explicit-any
    const angleList = (angles ?? []) as any[];
    const now = Date.now();
    const ageDays = (iso: string) => Math.floor((now - new Date(iso).getTime()) / 86_400_000);

    // ── 1. canon ─────────────────────────────────────────────────────────────
    const canonStr = angleList.map((a) =>
      `[${a.id}] ${a.pillar} · ${a.is_active ? "active" : "INACTIVE"} · age ${ageDays(a.created_at)}d · ${a.angle_name}\n` +
      `  framing: ${a.harbor_framing}\n` +
      `  substrate[EN]: ${a.therapeutic_substrate}\n` +
      `  substrate[ES]: ${a.therapeutic_substrate_es ?? "(none)"}\n` +
      `  embodiment[EN]: ${a.embodiment_instruction}\n` +
      `  embodiment[ES]: ${a.embodiment_instruction_es ?? "(none)"}`,
    ).join("\n\n");

    // ── 2. score patterns: join scores↔assignments by (post_id,language) ──────
    const ENG_DIMS = ["witnessing_register", "grounding", "competitive_bar", "therapeutic_depth", "prose_quality"];
    const ES_DIMS = ["witnessing_register", "grounding", "competitive_bar", "therapeutic_depth", "native_cadence"];
    const angleByPost = new Map<string, string>();
    for (const a of (assigns ?? []) as { post_id: string; language: string; angle_id: string }[]) {
      angleByPost.set(`${a.post_id}|${a.language}`, a.angle_id);
    }
    // accumulator: key `${angle}|${lang}` -> { n, overall_sum, dim_sums }
    const acc = new Map<string, { n: number; overall: number; dims: Record<string, number> }>();
    const libN: Record<string, { n: number; sum: number }> = {};
    for (const row of (scores ?? []) as { post_id: string; language: string; overall_score: number; scales: Record<string, unknown> }[]) {
      const angle = angleByPost.get(`${row.post_id}|${row.language}`);
      if (!angle) continue;
      const dims = row.language === "es" ? ES_DIMS : ENG_DIMS;
      const key = `${angle}|${row.language}`;
      const e = acc.get(key) ?? { n: 0, overall: 0, dims: {} };
      e.n += 1;
      e.overall += Number(row.overall_score ?? 0);
      for (const d of dims) {
        const v = Number((row.scales as Record<string, unknown>)?.[d] ?? 0);
        e.dims[d] = (e.dims[d] ?? 0) + v;
        libN[d] = libN[d] ?? { n: 0, sum: 0 };
        libN[d].n += 1; libN[d].sum += v;
      }
      acc.set(key, e);
    }
    const libMean: Record<string, number> = {};
    for (const [d, v] of Object.entries(libN)) libMean[d] = v.n ? v.sum / v.n : 0;
    const scoreStr = [...acc.entries()].sort().map(([key, e]) => {
      const [angle, lang] = key.split("|");
      const dims = lang === "es" ? ES_DIMS : ENG_DIMS;
      const parts = dims.map((d) => {
        const mean = e.dims[d] / e.n;
        const delta = mean - (libMean[d] ?? 0);
        return `${d} ${mean.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)})`;
      }).join(", ");
      return `${angle} [${lang}] n=${e.n} overall ${(e.overall / e.n).toFixed(2)} · ${parts}`;
    }).join("\n") || "(no scored letters yet)";
    const libMeanStr = Object.entries(libMean).map(([d, m]) => `${d} ${m.toFixed(1)}`).join(", ") || "(none)";

    // ── 3. failed drafts ──────────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    const failedStr = ((failed ?? []) as any[]).map((f) =>
      `${f.angle_id} [${f.language}] attempt ${f.attempt_number} · ${f.failure_reason} · overall ${f.critic_overall_score ?? "n/a"}`,
    ).join("\n") || "(no failed-draft rows yet — table is young)";

    // ── 4. sample letters + 5. publish proxy ──────────────────────────────────
    // deno-lint-ignore no-explicit-any
    const trs = (recentTr ?? []) as any[];
    const sampleStr = trs.map((t) => {
      const bp = Array.isArray(t.blog_posts) ? t.blog_posts[0] : t.blog_posts;
      const body = (t.content as string) ?? "";
      const opening = body.slice(0, 400);
      const closing = body.trim().split(/\n+/).pop()?.slice(-200) ?? "";
      return `${bp?.pillar ?? "?"} [${t.language}] "${t.title}"\n  opening: ${opening}\n  closing: ${closing}`;
    }).join("\n\n") || "(none)";

    // publish proxy: per angle, shipped vs total (join assignments -> is_published)
    const publishedByPost = new Map<string, boolean>();
    for (const t of trs) {
      const bp = Array.isArray(t.blog_posts) ? t.blog_posts[0] : t.blog_posts;
      publishedByPost.set(`${t.post_id}|${t.language}`, !!bp?.is_published);
    }
    const pub: Record<string, { total: number; shipped: number }> = {};
    for (const a of (assigns ?? []) as { post_id: string; language: string; angle_id: string }[]) {
      const p = pub[a.angle_id] ?? { total: 0, shipped: 0 };
      p.total += 1;
      if (publishedByPost.get(`${a.post_id}|${a.language}`)) p.shipped += 1;
      pub[a.angle_id] = p;
    }
    const publishStr = Object.entries(pub).sort().map(([angle, p]) =>
      `${angle}: ${p.shipped}/${p.total} shipped`,
    ).join("\n") || "(publish state not available from sampled letters)";

    // ── Render the prompts ───────────────────────────────────────────────────
    const { data: sysTmpl } = await supabase
      .from("prompt_templates").select("system_prompt").eq("slug", "psychologist.system").eq("is_active", true).maybeSingle();
    const { data: userTmpl } = await supabase
      .from("prompt_templates").select("user_prompt_template, max_tokens").eq("slug", "psychologist.user").eq("is_active", true).maybeSingle();
    if (!sysTmpl?.system_prompt || !userTmpl?.user_prompt_template) {
      throw new Error("psychologist.system / psychologist.user templates not found (apply psychologist_002).");
    }
    const maxTokens = Number((userTmpl as { max_tokens?: number }).max_tokens ?? 16000);

    const userPrompt = renderTemplate((userTmpl as { user_prompt_template: string }).user_prompt_template, {
      run_id: runId,
      run_date: new Date().toISOString().slice(0, 10),
      triggered_by: trigger,
      last_run_at: s.psychologist_last_run_at ?? "never",
      canon: canonStr,
      score_patterns: scoreStr,
      library_means: libMeanStr,
      failed_drafts: failedStr,
      sample_letters: sampleStr,
      publish_signal: publishStr,
      voice_never_list: VOICE_NEVER_LIST,
      source_allowlist: allowlist.join("\n"),
    });

    // ── Run the agent ────────────────────────────────────────────────────────
    const result = await runAgent(
      anthropicKey, model, (sysTmpl as { system_prompt: string }).system_prompt, userPrompt, allowlist, maxTokens,
    );

    await supabase.from("ai_usage_log").insert({
      provider: "anthropic", model, task: "psychologist", called_from: "edge:psychologist",
      input_tokens: result.input_tokens, output_tokens: result.output_tokens, cached_tokens: 0,
      estimated_cost_usd: 0, latency_ms: 0,
    });

    // ── Parse + validate ─────────────────────────────────────────────────────
    const parsed = extractJson(result.text);
    // deno-lint-ignore no-explicit-any
    const rawProposals: any[] = Array.isArray(parsed.proposals) ? parsed.proposals : [];

    const rows = rawProposals
      .filter((p) => ALLOWED_PROPOSAL_TYPES.has(p?.proposal_type))
      .map((p) => {
        // deno-lint-ignore no-explicit-any
        const cites: any[] = Array.isArray(p.citations) ? p.citations : [];
        const validCites = cites.filter((c) => c?.url && hostAllowed(hostOf(c.url), allowlist));
        const required = CITATION_REQUIRED_TYPES.has(p.proposal_type);
        const citationsValidated = required
          ? validCites.length >= 2 && validCites.length === cites.length
          : validCites.length === cites.length;
        return {
          run_id: runId,
          impact_rank: Number(p.impact_rank ?? 0),
          proposal_type: p.proposal_type,
          target_angle_id: p.target_angle_id ?? null,
          target_pillar: p.target_pillar ?? null,
          language: ["en", "es", "both"].includes(p.language) ? p.language : null,
          current_value: p.current_value ?? null,
          proposed_value: p.proposed_value ?? null,
          reasoning: String(p.reasoning ?? ""),
          citations: validCites,
          citations_validated: citationsValidated,
          confidence: ALLOWED_CONFIDENCE.has(p.confidence) ? p.confidence : null,
          status: "pending",
        };
      });

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("psychologist_proposals").insert(rows);
      if (insErr) throw new Error(`proposal insert failed: ${insErr.message}`);
    }

    await supabase.from("psychologist_runs").update({
      status: "completed",
      summary: String(parsed.summary ?? "").slice(0, 4000),
      proposal_count: rows.length,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
    }).eq("id", runId);

    // Stamp the cadence clock so the 30-day cron guard works.
    await supabase.from("admin_settings")
      .update({ psychologist_last_run_at: new Date().toISOString() }).eq("id", 1);

    return new Response(JSON.stringify({
      status: "completed", run_id: runId, proposal_count: rows.length,
      summary: parsed.summary ?? "",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await supabase.from("psychologist_runs").update({ status: "failed", error: msg.slice(0, 2000) }).eq("id", runId);
    return new Response(JSON.stringify({ status: "failed", run_id: runId, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
