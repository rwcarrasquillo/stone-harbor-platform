// apps/stone-harbor/supabase/functions/score-blog-draft/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — score-blog-draft (SH-78 Phase 1 scorer).
 *
 * Scores a generated letter against the Harbor Voice rubric and writes the
 * result to blog_draft_scores. Used in three modes:
 *
 *   1. Single — { post_id, language }
 *      Scores one specific translation. Used for ad-hoc rescoring or by
 *      generate-blog-posts (in a follow-up ticket) right after generation.
 *
 *   2. Backfill — { mode: "backfill", limit?: number }
 *      Scores every translation that doesn't already have a row in
 *      blog_draft_scores. Used to calibrate the threshold against the
 *      existing published library before the gate is turned on.
 *      Default limit 20 (each score takes ~10-15s, so ~3-4 min per call;
 *      Supabase ceiling 150s ≈ 10 per call comfortably).
 *
 *   3. Rescore — { mode: "rescore", post_ids: [...], language? }
 *      Rescores specific translations even if they already have a score.
 *      Used when the rubric is updated (prompt_templates.blog.score.* edits)
 *      and we want to see the new distribution.
 *
 * Output: { status: "completed", count, results: [...], summary }
 *
 * Provider routing reuses admin_settings.ai_primary_provider (anthropic
 * primary by convention). Falls back to OpenAI if Anthropic errors.
 *
 * Logged in ai_usage_log with called_from = 'edge:score-blog-draft'.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Lang = "en" | "es";
type Provider = "anthropic" | "openai";
type Pillar = "clarity" | "calm" | "strength";

/**
 * Weighted overall score. Five dimensions after SH-85 Phase 2:
 *   - witnessing_register (×1.5) — the central voice axis; holds/reflects
 *   - therapeutic_depth (×1.6) — does the letter ENCODE the assigned substrate;
 *                                 highest weight because this is the editorial
 *                                 center of gravity for the multi-agent system
 *   - competitive_bar (×1.4) — Voice §9 must-beat-category rule
 *   - grounding (×1.3) — concrete sensory anchoring
 *   - prose_quality (EN) OR native_cadence (ES) (×1.2) — literary craft
 *
 * Denominator 7.0 so the final score stays on the 1-10 scale.
 */
const WEIGHTS = {
  witnessing_register: 1.5,
  grounding: 1.3,
  prose_or_cadence: 1.2,
  competitive_bar: 1.4,
  therapeutic_depth: 1.6,
};
const WEIGHT_SUM =
  WEIGHTS.witnessing_register +
  WEIGHTS.grounding +
  WEIGHTS.prose_or_cadence +
  WEIGHTS.competitive_bar +
  WEIGHTS.therapeutic_depth;

type ScoreScales = {
  witnessing_register: number;
  grounding: number;
  /** EN only */
  prose_quality?: number;
  /** ES only */
  native_cadence?: number;
  competitive_bar: number;
  therapeutic_depth: number;
};

type HardRules = {
  word_count_ok: boolean;
  word_count: number;
  forbidden_phrases_ok: boolean;
  forbidden_phrases_found: string[];
  /** ES only */
  usted_ok?: boolean;
  /** ES only */
  usted_count?: number;
  pillar_coherence_ok: boolean;
  pillar_coherence_reasoning: string;
};

type RubricOutput = {
  hard_rules: HardRules;
  scales: ScoreScales & Record<`${keyof ScoreScales}_reasoning`, string>;
  summary: string;
};

type CallResult = {
  text: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  latency_ms: number;
};

function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

async function callAnthropic(
  key: string,
  model: string,
  system: string,
  user: string,
  temperature: number | null,
  maxTokens: number | null,
): Promise<CallResult> {
  const start = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 2000,
      temperature: temperature ?? undefined,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  return {
    text: (body.content?.[0]?.text ?? "").trim(),
    input_tokens: body.usage?.input_tokens ?? 0,
    output_tokens: body.usage?.output_tokens ?? 0,
    cached_tokens:
      (body.usage?.cache_read_input_tokens ?? 0) +
      (body.usage?.cache_creation_input_tokens ?? 0),
    latency_ms: Date.now() - start,
  };
}

async function callOpenAI(
  key: string,
  model: string,
  system: string,
  user: string,
  temperature: number | null,
  maxTokens: number | null,
): Promise<CallResult> {
  const start = Date.now();
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 2000,
      temperature: temperature ?? undefined,
      messages,
      // Nudge OpenAI toward strict JSON output. Anthropic doesn't have a
      // response_format param; we rely on the system prompt's "STRICT JSON"
      // instruction instead.
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  return {
    text: (body.choices?.[0]?.message?.content ?? "").trim(),
    input_tokens: body.usage?.prompt_tokens ?? 0,
    output_tokens: body.usage?.completion_tokens ?? 0,
    cached_tokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    latency_ms: Date.now() - start,
  };
}

function estimateCost(
  model: string,
  inTok: number,
  outTok: number,
  pricing: Record<
    string,
    { input_per_million?: number; output_per_million?: number }
  >,
): number {
  const row = pricing[model];
  if (!row) return 0;
  const i = (inTok / 1_000_000) * (row.input_per_million ?? 0);
  const o = (outTok / 1_000_000) * (row.output_per_million ?? 0);
  return Number((i + o).toFixed(6));
}

/**
 * Parse the LLM's response into a RubricOutput. Tolerates the common
 * failure modes — markdown fences, leading/trailing prose — by extracting
 * the first {...} balanced object from the text.
 */
function parseRubric(raw: string): RubricOutput {
  // Strip common markdown fence wrappers first.
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  // If the response starts with non-JSON prose, scan for the first '{'.
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(`Scorer response had no JSON object: ${text.slice(0, 200)}`);
  }
  const candidate = text.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(candidate) as RubricOutput;
  if (!parsed.hard_rules || !parsed.scales) {
    throw new Error("Scorer response missing hard_rules or scales");
  }
  return parsed;
}

/**
 * Compute the weighted overall score on the 1-10 scale. Defensive: clamps
 * each scale to [0, 10] in case the LLM returns a stray 11 or -1.
 */
function computeOverallScore(scales: ScoreScales, lang: Lang): number {
  const clamp = (n: number) => Math.max(0, Math.min(10, n));
  const w = WEIGHTS;
  const fourthAxis =
    lang === "es" ? scales.native_cadence ?? 0 : scales.prose_quality ?? 0;
  const weighted =
    clamp(scales.witnessing_register) * w.witnessing_register +
    clamp(scales.grounding) * w.grounding +
    clamp(fourthAxis) * w.prose_or_cadence +
    clamp(scales.competitive_bar) * w.competitive_bar +
    clamp(scales.therapeutic_depth ?? 0) * w.therapeutic_depth;
  return Number((weighted / WEIGHT_SUM).toFixed(2));
}

/**
 * Did all hard rules pass? Different rule set per language.
 */
function allHardRulesPassed(hard: HardRules, lang: Lang): boolean {
  if (!hard.word_count_ok) return false;
  if (!hard.forbidden_phrases_ok) return false;
  if (!hard.pillar_coherence_ok) return false;
  if (lang === "es" && hard.usted_ok === false) return false;
  return true;
}

type ScoreOutcome = {
  post_id: string;
  language: Lang;
  status: "scored" | "skipped" | "failed";
  overall_score?: number;
  hard_rules_passed?: boolean;
  passed_threshold?: boolean;
  error?: string;
};

/**
 * The core scoring routine. Reads the translation row, calls the LLM with
 * the language-specific scoring prompt, parses, computes overall, upserts.
 */
async function scoreOne(
  supabase: ReturnType<typeof createClient>,
  post_id: string,
  language: Lang,
  ctx: {
    primary: Provider;
    fallback: Provider;
    anthropicKey: string | undefined;
    openaiKey: string | undefined;
    aiModels: Record<string, Record<Provider, string>>;
    aiPricing: Record<
      string,
      { input_per_million?: number; output_per_million?: number }
    >;
    threshold: number;
  },
): Promise<ScoreOutcome> {
  // 1. Pull the translation + parent pillar.
  const { data: row, error: rowErr } = await supabase
    .from("blog_post_translations")
    .select("post_id, language, title, content, blog_posts:post_id (pillar)")
    .eq("post_id", post_id)
    .eq("language", language)
    .maybeSingle();
  if (rowErr || !row) {
    return { post_id, language, status: "failed", error: rowErr?.message ?? "translation not found" };
  }
  // PostgREST nests the parent under the alias key; tolerate both shapes.
  const parent = Array.isArray((row as any).blog_posts)
    ? (row as any).blog_posts[0]
    : (row as any).blog_posts;
  const pillar = (parent?.pillar ?? "clarity") as Pillar;
  const content = (row as any).content as string;
  if (!content || content.trim().length < 50) {
    return { post_id, language, status: "failed", error: "translation content is empty/too short" };
  }

  // 2a. Pull the editorial assignment (if any) so we can pass the
  // substrate + embodiment instruction to the scorer for therapeutic_depth.
  // Legacy letters generated before SH-85 have no assignment — fall back to
  // empty/placeholder strings; scorer will judge therapeutic_depth against
  // general harbor recovery substrate.
  const { data: assignment } = await supabase
    .from("editorial_assignments")
    .select(
      "angle_id, editorial_canon_angles:angle_id(angle_name, therapeutic_substrate, embodiment_instruction, therapeutic_substrate_es, embodiment_instruction_es)",
    )
    .eq("post_id", post_id)
    .eq("language", language)
    .eq("succeeded", true)
    .order("attempted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const angleRow = (assignment as any)?.editorial_canon_angles;
  const angle = Array.isArray(angleRow) ? angleRow[0] : angleRow;
  const angle_name = angle?.angle_name ?? "(no assignment — legacy letter)";
  // SH-92: score against the SAME language the Writer was primed with, so
  // therapeutic_depth judges the letter against the Spanish substrate for ES
  // letters. Fall back to EN if the ES column is null (defensive).
  const substrate =
    (language === "es"
      ? (angle?.therapeutic_substrate_es ?? angle?.therapeutic_substrate)
      : angle?.therapeutic_substrate) ??
    "(no substrate assigned — score therapeutic_depth against general harbor recovery substrate)";
  const embodiment_instruction =
    (language === "es"
      ? (angle?.embodiment_instruction_es ?? angle?.embodiment_instruction)
      : angle?.embodiment_instruction) ?? "";

  // 2b. Pull the scoring prompt template for this language.
  const slug = `blog.score.${language}`;
  const { data: tmpl, error: tmplErr } = await supabase
    .from("prompt_templates")
    .select("system_prompt, user_prompt_template, temperature, max_tokens")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (tmplErr || !tmpl) {
    return { post_id, language, status: "failed", error: `prompt template ${slug} not found` };
  }
  const system = (tmpl as any).system_prompt ?? "";
  const user = renderTemplate((tmpl as any).user_prompt_template, {
    pillar,
    content,
    angle_name,
    substrate,
    embodiment_instruction,
  });

  // 3. Call the LLM with the primary provider; fall back if it errors.
  async function tryProvider(p: Provider) {
    const model =
      ctx.aiModels["blog"]?.[p] ??
      (p === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
    const key = p === "anthropic" ? ctx.anthropicKey : ctx.openaiKey;
    if (!key) return null;
    try {
      const result =
        p === "anthropic"
          ? await callAnthropic(
              key,
              model,
              system,
              user,
              (tmpl as any).temperature,
              (tmpl as any).max_tokens,
            )
          : await callOpenAI(
              key,
              model,
              system,
              user,
              (tmpl as any).temperature,
              (tmpl as any).max_tokens,
            );
      await supabase.from("ai_usage_log").insert({
        provider: p,
        model,
        task: "blog",
        called_from: "edge:score-blog-draft",
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cached_tokens: result.cached_tokens,
        estimated_cost_usd: estimateCost(
          model,
          result.input_tokens,
          result.output_tokens,
          ctx.aiPricing,
        ),
        latency_ms: result.latency_ms,
      });
      return { result, provider: p, model };
    } catch (err) {
      await supabase.from("ai_usage_log").insert({
        provider: p,
        model,
        task: "blog",
        called_from: "edge:score-blog-draft",
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: 0,
        estimated_cost_usd: 0,
        latency_ms: 0,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      return null;
    }
  }

  let attempt = await tryProvider(ctx.primary);
  if (!attempt && ctx.fallback !== ctx.primary) {
    attempt = await tryProvider(ctx.fallback);
  }
  if (!attempt) {
    return { post_id, language, status: "failed", error: "both providers failed" };
  }

  // 4. Parse the rubric output.
  let rubric: RubricOutput;
  try {
    rubric = parseRubric(attempt.result.text);
  } catch (err) {
    return {
      post_id,
      language,
      status: "failed",
      error: `parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 5. Compute overall + threshold check.
  const overall_score = computeOverallScore(rubric.scales, language);
  const hard_rules_passed = allHardRulesPassed(rubric.hard_rules, language);
  const passed_threshold = hard_rules_passed && overall_score >= ctx.threshold;

  // 6. Upsert to blog_draft_scores.
  const { error: upsertErr } = await supabase
    .from("blog_draft_scores")
    .upsert(
      {
        post_id,
        language,
        overall_score,
        hard_rules_passed,
        hard_rules: rubric.hard_rules,
        scales: rubric.scales,
        summary: rubric.summary ?? null,
        threshold_at_scoring: ctx.threshold,
        passed_threshold,
        scorer_provider: attempt.provider,
        scorer_model: attempt.model,
        scored_at: new Date().toISOString(),
      },
      { onConflict: "post_id,language" },
    );
  if (upsertErr) {
    return { post_id, language, status: "failed", error: upsertErr.message };
  }

  return {
    post_id,
    language,
    status: "scored",
    overall_score,
    hard_rules_passed,
    passed_threshold,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE env" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let body: any = {};
    if (req.method === "POST") {
      try {
        body = await req.json();
      } catch (_) {
        body = {};
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from("admin_settings")
      .select(
        "ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing, blog_quality_gate_threshold",
      )
      .eq("id", 1)
      .maybeSingle();
    const primary: Provider =
      ((settings as any)?.ai_primary_provider as Provider) ?? "anthropic";
    const fallback: Provider =
      ((settings as any)?.ai_fallback_provider as Provider) ?? "openai";
    const aiModels = ((settings as any)?.ai_models ?? {}) as Record<
      string,
      Record<Provider, string>
    >;
    const aiPricing = ((settings as any)?.ai_pricing ?? {}) as Record<
      string,
      { input_per_million?: number; output_per_million?: number }
    >;
    const threshold = Number((settings as any)?.blog_quality_gate_threshold ?? 7.0);

    const ctx = {
      primary,
      fallback,
      anthropicKey,
      openaiKey,
      aiModels,
      aiPricing,
      threshold,
    };

    // ─── Mode dispatch ──────────────────────────────────────────────
    const mode: string = body?.mode ?? (body?.post_id ? "single" : "backfill");

    if (mode === "single") {
      const post_id: string | undefined = body?.post_id;
      const language: Lang = (body?.language ?? "en") as Lang;
      if (!post_id) {
        return new Response(
          JSON.stringify({ error: "post_id required for single mode" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const outcome = await scoreOne(supabase, post_id, language, ctx);
      return new Response(
        JSON.stringify({ status: "completed", count: 1, results: [outcome] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "rescore") {
      const post_ids: string[] = Array.isArray(body?.post_ids) ? body.post_ids : [];
      const language: Lang | undefined = body?.language;
      if (post_ids.length === 0) {
        return new Response(
          JSON.stringify({ error: "post_ids required for rescore mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const results: ScoreOutcome[] = [];
      for (const post_id of post_ids) {
        // If language specified, score that one; otherwise score both EN+ES.
        const langs: Lang[] = language ? [language] : (["en", "es"] as Lang[]);
        for (const lg of langs) {
          results.push(await scoreOne(supabase, post_id, lg, ctx));
        }
      }
      return new Response(
        JSON.stringify({ status: "completed", count: results.length, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // mode === "backfill" — pick N translations without a score row.
    //
    // We can't LEFT JOIN blog_draft_scores via PostgREST embedding because
    // we deliberately didn't add an FK (see migration comment on why —
    // we want orphaned scores to survive translation deletes for post-
    // mortem analysis). So instead: two cheap queries + a JS Set filter.
    const limit: number = Math.max(
      1,
      Math.min(50, Number(body?.limit ?? 20)),
    );
    const { data: scoredRows } = await supabase
      .from("blog_draft_scores")
      .select("post_id, language");
    // deno-lint-ignore no-explicit-any
    const scoredKeys = new Set(
      ((scoredRows ?? []) as any[]).map(
        (s) => `${s.post_id}|${s.language}`,
      ),
    );
    const { data: candidates, error: candErr } = await supabase
      .from("blog_post_translations")
      .select("post_id, language, blog_posts:post_id!inner (pillar)")
      .order("created_at", { ascending: false })
      .limit(500); // pull a wider pool, filter client-side
    if (candErr) {
      return new Response(
        JSON.stringify({ error: `candidate fetch failed: ${candErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // deno-lint-ignore no-explicit-any
    const unscored = ((candidates ?? []) as any[])
      // deno-lint-ignore no-explicit-any
      .filter((r: any) => {
        if (scoredKeys.has(`${r.post_id}|${r.language}`)) return false;
        // Only score translations whose parent has a pillar (skip externals).
        const bp = Array.isArray(r.blog_posts) ? r.blog_posts[0] : r.blog_posts;
        return !!bp?.pillar;
      })
      .slice(0, limit);

    const results: ScoreOutcome[] = [];
    for (const t of unscored) {
      const outcome = await scoreOne(
        supabase,
        t.post_id,
        t.language as Lang,
        ctx,
      );
      results.push(outcome);
    }

    return new Response(
      JSON.stringify({
        status: "completed",
        count: results.length,
        remaining: unscored.length < limit ? 0 : "unknown",
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
