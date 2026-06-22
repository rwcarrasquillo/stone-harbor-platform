import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — translate-blog-post.
 *
 * Takes an English letter's post_id (or runs in batch mode when no
 * post_id is provided), reads its EN translation row, prompts the LLM
 * to produce a Spanish counterpart in the harbor voice via the
 * `blog.translate.es` prompt template, and inserts the result as an
 * is_published=false draft into blog_post_translations.
 *
 * Request body:
 *   { post_id: "uuid" }   — translate one specific letter
 *   { }                   — batch mode: translate every EN letter
 *                           that doesn't yet have an ES counterpart
 *
 * Response: { status, results: [{ post_id, status, title?, error? }] }
 *
 * Uses the same provider routing as generate-blog-posts (admin_settings
 * .ai_primary_provider, .ai_fallback_provider, .ai_models, .ai_pricing).
 * Logs to ai_usage_log under task "blog_translate".
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Provider = "anthropic" | "openai";

function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? "");
}

type CallResult = {
  text: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  latency_ms: number;
};

async function callAnthropic(
  key: string, model: string, system: string, user: string,
  temperature: number | null, maxTokens: number | null,
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
      max_tokens: maxTokens ?? 2500,
      temperature: temperature ?? undefined,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  return {
    text: (body.content?.[0]?.text ?? "").trim(),
    input_tokens: body.usage?.input_tokens ?? 0,
    output_tokens: body.usage?.output_tokens ?? 0,
    cached_tokens: (body.usage?.cache_read_input_tokens ?? 0) + (body.usage?.cache_creation_input_tokens ?? 0),
    latency_ms: Date.now() - start,
  };
}

async function callOpenAI(
  key: string, model: string, system: string, user: string,
  temperature: number | null, maxTokens: number | null,
): Promise<CallResult> {
  const start = Date.now();
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 2500,
      temperature: temperature ?? undefined,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  model: string, inTok: number, outTok: number,
  pricing: Record<string, { input_per_million?: number; output_per_million?: number }>,
): number {
  const row = pricing[model];
  if (!row) return 0;
  const i = (inTok / 1_000_000) * (row.input_per_million ?? 0);
  const o = (outTok / 1_000_000) * (row.output_per_million ?? 0);
  return Number((i + o).toFixed(6));
}

function parseResponse(raw: string): { title: string; summary: string; body: string } {
  const titleMatch = raw.match(/^Title:\s*(.+)$/im);
  const summaryMatch = raw.match(/^Summary:\s*(.+)$/im);
  if (!titleMatch || !summaryMatch) {
    throw new Error("Model output missing Title/Summary header. Raw: " + raw.slice(0, 300));
  }
  const title = titleMatch[1].trim().replace(/^["“”]+|["“”]+$/g, "");
  const summary = summaryMatch[1].trim().replace(/^["“”]+|["“”]+$/g, "");
  const body = raw
    .replace(/^Title:.+$/im, "")
    .replace(/^Summary:.+$/im, "")
    .trim();
  if (body.split(/\s+/).length < 400) {
    throw new Error(`Body is too short (${body.split(/\s+/).length} words)`);
  }
  return { title, summary, body };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let postIdFilter: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.post_id === "string") postIdFilter = body.post_id;
      } catch (_) {}
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from("admin_settings")
      .select("ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing, ai_tone_guidance")
      .eq("id", 1)
      .maybeSingle();
    const primary: Provider = (settings?.ai_primary_provider as Provider) ?? "anthropic";
    const fallback: Provider = (settings?.ai_fallback_provider as Provider) ?? "openai";
    const aiModels = (settings?.ai_models ?? {}) as Record<string, Record<Provider, string>>;
    const aiPricing = (settings?.ai_pricing ?? {}) as Record<string, { input_per_million?: number; output_per_million?: number }>;
    const toneGuidance: string = settings?.ai_tone_guidance ?? "";

    // Load the translate prompt template once.
    const { data: tmpl } = await supabase
      .from("prompt_templates")
      .select("user_prompt_template, system_prompt, temperature, max_tokens")
      .eq("slug", "blog.translate.es")
      .maybeSingle();
    if (!tmpl) {
      return new Response(JSON.stringify({
        error: "Prompt template blog.translate.es not found. Apply letters_002 migration first.",
      }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find target post_ids — either the one specified, or all EN letters
    // without an ES counterpart.
    let targetQuery = supabase
      .from("blog_posts")
      .select(`
        id, pillar,
        translation:blog_post_translations!inner ( title, summary, content )
      `)
      .eq("consumer", "stone_harbor")
      .eq("translation.language", "en")
      .eq("translation.is_published", true);

    if (postIdFilter) {
      targetQuery = targetQuery.eq("id", postIdFilter);
    } else {
      // Batch mode: exclude any post that already has an ES translation.
      const { data: alreadyTranslated } = await supabase
        .from("blog_post_translations")
        .select("post_id")
        .eq("language", "es");
      const excludeIds = (alreadyTranslated ?? []).map((r: { post_id: string }) => r.post_id);
      if (excludeIds.length > 0) {
        targetQuery = targetQuery.not("id", "in", `(${excludeIds.join(",")})`);
      }
    }

    const { data: targets, error: targetsErr } = await targetQuery;
    if (targetsErr) {
      return new Response(JSON.stringify({ error: `Target query failed: ${targetsErr.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    type TranslationRow = { title: string; summary: string | null; content: string };
    type TargetRow = {
      id: string;
      pillar: string;
      translation: TranslationRow[] | TranslationRow | null;
    };
    const results: Array<Record<string, unknown>> = [];

    for (const t of (targets ?? []) as TargetRow[]) {
      const tr = Array.isArray(t.translation) ? t.translation[0] : t.translation;
      if (!tr) {
        results.push({ post_id: t.id, status: "skipped", reason: "no EN translation" });
        continue;
      }

      const user = renderTemplate(tmpl.user_prompt_template, {
        pillar: t.pillar,
        title: tr.title,
        summary: tr.summary ?? "",
        content: tr.content,
      });
      const system = [toneGuidance, tmpl.system_prompt ?? ""].filter(Boolean).join("\n\n");

      async function tryProvider(p: Provider) {
        const model = aiModels["blog"]?.[p] ?? (p === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
        const key = p === "anthropic" ? anthropicKey : openaiKey;
        if (!key) return null;
        try {
          const result = p === "anthropic"
            ? await callAnthropic(key, model, system, user, tmpl.temperature, tmpl.max_tokens)
            : await callOpenAI(key, model, system, user, tmpl.temperature, tmpl.max_tokens);
          await supabase.from("ai_usage_log").insert({
            provider: p, model, task: "blog_translate",
            called_from: "edge:translate-blog-post",
            input_tokens: result.input_tokens,
            output_tokens: result.output_tokens,
            cached_tokens: result.cached_tokens,
            estimated_cost_usd: estimateCost(model, result.input_tokens, result.output_tokens, aiPricing),
            latency_ms: result.latency_ms,
          });
          return { result, model };
        } catch (err) {
          await supabase.from("ai_usage_log").insert({
            provider: p, model, task: "blog_translate",
            called_from: "edge:translate-blog-post",
            input_tokens: 0, output_tokens: 0, cached_tokens: 0,
            estimated_cost_usd: 0, latency_ms: 0,
            error: err instanceof Error ? err.message.slice(0, 500) : String(err),
          });
          return null;
        }
      }

      let attempt = await tryProvider(primary);
      if (!attempt && fallback !== primary) attempt = await tryProvider(fallback);
      if (!attempt) {
        results.push({ post_id: t.id, status: "failed", error: "Both providers failed" });
        continue;
      }

      try {
        const parsed = parseResponse(attempt.result.text);
        const { error: insErr } = await supabase
          .from("blog_post_translations")
          .insert({
            post_id: t.id,
            language: "es",
            title: parsed.title,
            excerpt: parsed.summary,
            summary: parsed.summary,
            content: parsed.body,
            is_published: false,
          });
        if (insErr) throw new Error(insErr.message);
        results.push({
          post_id: t.id,
          status: "success",
          title: parsed.title,
          model: attempt.model,
        });
      } catch (err) {
        results.push({
          post_id: t.id,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return new Response(JSON.stringify({ status: "completed", count: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
