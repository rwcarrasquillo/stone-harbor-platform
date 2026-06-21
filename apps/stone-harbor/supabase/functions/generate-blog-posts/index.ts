// apps/stone-harbor/supabase/functions/generate-blog-posts/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — generate-blog-posts (bilingual, post-i18n).
 *
 * For each requested pillar, generates one Letter in EACH requested
 * language (default ['en','es']) by reading the matching prompt
 * template `blog.{pillar}.{lang}`. Inserts:
 *
 *   - ONE row into blog_posts (language-independent: pillar, model,
 *     prompt, is_ai_generated, consumer, cover_image_url=null).
 *   - ONE row into blog_post_translations per language, linked by
 *     post_id, language='en'|'es', is_published=false.
 *
 * For backward compatibility during Phase 1B, the legacy
 * blog_posts.title/excerpt/summary/content columns are ALSO populated
 * with the English version of the generated content. This lets the
 * legacy admin draft list (which still reads those columns) keep
 * working until Phase 2 rewrites the admin UI.
 *
 * On Phase 1C the legacy columns get dropped and this dual-write step
 * is removed.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Pillar = "clarity" | "calm" | "strength";
const PILLARS: Pillar[] = ["clarity", "calm", "strength"];
type Lang = "en" | "es";
const LANGS: Lang[] = ["en", "es"];
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
      max_tokens: maxTokens ?? 2000,
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
    cached_tokens: (body.usage?.cache_read_input_tokens ?? 0) +
                   (body.usage?.cache_creation_input_tokens ?? 0),
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 2000,
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
  // Title:/Summary: markers stay in English even for Spanish prompts —
  // the prompt template instructs the model to keep them as parseable
  // tokens regardless of body language.
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
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Request body — optional pillar filter + optional languages array.
    let requestedPillars: Pillar[] = PILLARS;
    let requestedLanguages: Lang[] = LANGS;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.pillar === "string") {
          const p = body.pillar.toLowerCase();
          if (PILLARS.includes(p as Pillar)) requestedPillars = [p as Pillar];
        }
        if (body && Array.isArray(body.languages)) {
          const ls = body.languages.filter((l: unknown): l is Lang =>
            typeof l === "string" && LANGS.includes(l as Lang)
          );
          if (ls.length > 0) requestedLanguages = ls;
        }
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

    const results: Array<Record<string, unknown>> = [];

    for (const pillar of requestedPillars) {
      // For each pillar we generate the requested languages IN PARALLEL.
      // The pillar row in blog_posts is inserted AFTER all languages
      // complete so we can write the parent + all translations in a
      // single logical "letter" creation.

      type LangAttempt = {
        lang: Lang;
        ok: boolean;
        parsed?: { title: string; summary: string; body: string };
        provider?: Provider;
        model?: string;
        prompt?: string;
        error?: string;
      };

      const langAttempts: LangAttempt[] = await Promise.all(
        requestedLanguages.map(async (lang): Promise<LangAttempt> => {
          const slug = `blog.${pillar}.${lang}`;
          const { data: tmpl } = await supabase
            .from("prompt_templates")
            .select("user_prompt_template, system_prompt, temperature, max_tokens, active_version")
            .eq("slug", slug)
            .maybeSingle();
          if (!tmpl) {
            return { lang, ok: false, error: `Prompt template ${slug} not found.` };
          }
          const user = renderTemplate(tmpl.user_prompt_template, { pillar });
          const system = [toneGuidance, tmpl.system_prompt ?? ""].filter(Boolean).join("\n\n");

          // Provider attempt with fallback. Same shape as the prior version.
          async function tryProvider(p: Provider) {
            const model = aiModels["blog"]?.[p] ?? (p === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
            const key = p === "anthropic" ? anthropicKey : openaiKey;
            if (!key) return null;
            try {
              const result = p === "anthropic"
                ? await callAnthropic(key, model, system, user, tmpl.temperature, tmpl.max_tokens)
                : await callOpenAI(key, model, system, user, tmpl.temperature, tmpl.max_tokens);
              await supabase.from("ai_usage_log").insert({
                provider: p, model, task: "blog",
                called_from: `edge:generate-blog-posts:${lang}`,
                input_tokens: result.input_tokens,
                output_tokens: result.output_tokens,
                cached_tokens: result.cached_tokens,
                estimated_cost_usd: estimateCost(model, result.input_tokens, result.output_tokens, aiPricing),
                latency_ms: result.latency_ms,
              });
              return { result, model };
            } catch (err) {
              await supabase.from("ai_usage_log").insert({
                provider: p, model, task: "blog",
                called_from: `edge:generate-blog-posts:${lang}`,
                input_tokens: 0, output_tokens: 0, cached_tokens: 0,
                estimated_cost_usd: 0, latency_ms: 0,
                error: err instanceof Error ? err.message.slice(0, 500) : String(err),
              });
              return null;
            }
          }

          let providerUsed: Provider = primary;
          let attempt = await tryProvider(primary);
          if (!attempt && fallback !== primary) {
            providerUsed = fallback;
            attempt = await tryProvider(fallback);
          }
          if (!attempt) return { lang, ok: false, error: "Both providers failed.", prompt: user };

          try {
            const parsed = parseResponse(attempt.result.text);
            return { lang, ok: true, parsed, provider: providerUsed, model: attempt.model, prompt: user };
          } catch (err) {
            return { lang, ok: false, error: err instanceof Error ? err.message : String(err), prompt: user };
          }
        }),
      );

      // If at least one language succeeded, create the parent + translations.
      const successful = langAttempts.filter((a): a is LangAttempt & { ok: true } => a.ok && !!a.parsed);
      if (successful.length === 0) {
        // All languages failed for this pillar — log and continue.
        for (const failed of langAttempts) {
          await supabase.from("blog_generation_logs").insert({
            pillar,
            status: "failed",
            message: failed.error ?? "unknown",
            model: failed.model ?? null,
            prompt: failed.prompt ?? null,
          });
        }
        results.push({ pillar, status: "failed", error: "All languages failed." });
        continue;
      }

      // Pick the English attempt (or the first successful one) as the
      // "canonical" letter for the dual-write of the legacy columns.
      const canonical = successful.find((a) => a.lang === "en") ?? successful[0];

      const { data: inserted, error: insertErr } = await supabase
        .from("blog_posts")
        .insert({
          // Legacy columns — dual-write so the old admin draft list keeps
          // working until Phase 2 rewrites it. Dropped in Phase 1C.
          title: canonical.parsed!.title,
          excerpt: canonical.parsed!.summary,
          summary: canonical.parsed!.summary,
          content: canonical.parsed!.body,
          is_published: false,
          // Language-independent fields.
          pillar,
          category: "Recovery",
          is_ai_generated: true,
          model: canonical.model,
          prompt: canonical.prompt,
          cover_image_url: null,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        results.push({ pillar, status: "failed", error: insertErr?.message ?? "insert returned no row" });
        continue;
      }

      // Insert translation rows for every successful language.
      const translationRows = successful.map((a) => ({
        post_id: inserted.id,
        language: a.lang,
        title: a.parsed!.title,
        excerpt: a.parsed!.summary,
        summary: a.parsed!.summary,
        content: a.parsed!.body,
        slug: null,
        is_published: false,
      }));
      const { error: trErr } = await supabase
        .from("blog_post_translations")
        .insert(translationRows);
      if (trErr) {
        results.push({ pillar, status: "partial", error: `Parent inserted but translations failed: ${trErr.message}`, post_id: inserted.id });
        continue;
      }

      await supabase.from("blog_generation_logs").insert({
        pillar,
        status: "success",
        message: `Drafted ${pillar} letter in ${successful.length} language(s): ${successful.map(a => a.lang).join(", ")}`,
        model: canonical.model,
        prompt: canonical.prompt,
        post_id: inserted.id,
      });

      results.push({
        pillar,
        status: successful.length === requestedLanguages.length ? "success" : "partial",
        post_id: inserted.id,
        languages_generated: successful.map(a => a.lang),
        languages_failed: langAttempts.filter(a => !a.ok).map(a => a.lang),
        title: canonical.parsed!.title,
      });
    }

    return new Response(
      JSON.stringify({ status: "completed", results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
