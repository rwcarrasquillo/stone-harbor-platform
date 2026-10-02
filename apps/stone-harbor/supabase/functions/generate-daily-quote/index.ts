import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — generate-daily-quote (DB-driven prompts).
 *
 * Reads prompt_templates[quote.daily] + admin_settings on each
 * invocation. Substitutes {{quote_date}}, {{theme}}, {{category}},
 * {{theme_guidance}} into the template, then routes through the
 * configured primary provider with fallback. Writes usage rows
 * to ai_usage_log.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Provider = "anthropic" | "openai";

const themes = [
  "Clarity",
  "Rebuilding",
  "Healing",
  "Growing",
  "Surviving",
  "Thriving",
];

function getDateString(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().split("T")[0];
}

function cleanQuote(raw: string): string {
  return raw
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/^Quote:\s*/i, "")
    .trim();
}

function getThemeGuidance(theme: string): string {
  switch (theme) {
    case "Clarity":
      return "Focus on seeing truth clearly, restoring self-trust, and understanding patterns.";
    case "Rebuilding":
      return "Focus on rebuilding identity, structure, discipline, and self-respect.";
    case "Healing":
      return "Focus on emotional recovery, peace, self-compassion, and inner repair.";
    case "Growing":
      return "Focus on wisdom, forward movement, learning, and personal evolution.";
    case "Surviving":
      return "Focus on endurance, safety, resilience, and making it through hardship.";
    case "Thriving":
      return "Focus on confidence, purpose, strength, and becoming stronger than before.";
    default:
      return "Focus on grounded strength, healing, and masculine encouragement.";
  }
}

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
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens ?? 200,
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
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: maxTokens ?? 200, temperature: temperature ?? undefined, messages }),
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE env" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Pull AI config + prompt template.
    const [{ data: settings }, { data: tmpl }] = await Promise.all([
      supabase.from("admin_settings")
        .select("ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing, ai_tone_guidance")
        .eq("id", 1).maybeSingle(),
      supabase.from("prompt_templates")
        .select("user_prompt_template, system_prompt, temperature, max_tokens, active_version")
        .eq("slug", "quote.daily").maybeSingle(),
    ]);
    if (!tmpl) {
      return new Response(JSON.stringify({ error: "prompt_templates[quote.daily] missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const primary: Provider = (settings?.ai_primary_provider as Provider) ?? "openai";
    const fallback: Provider = (settings?.ai_fallback_provider as Provider) ?? "anthropic";
    const aiModels = (settings?.ai_models ?? {}) as Record<string, Record<Provider, string>>;
    const aiPricing = (settings?.ai_pricing ?? {}) as Record<string, { input_per_million?: number; output_per_million?: number }>;
    const toneGuidance: string = settings?.ai_tone_guidance ?? "";
    const categories = ["healing", "resilience", "discipline", "self_respect", "peace", "confidence"];
    const results = [];

    for (let day = 0; day < 2; day++) {
      const quoteDate = getDateString(day);
      const category = categories[day % categories.length];

      for (const theme of themes) {
        try {
          const { data: existing } = await supabase
            .from("daily_quotes")
            .select("id, quote_text")
            .eq("quote_date", quoteDate).eq("audience", "men")
            .eq("theme", theme).eq("is_active", true).maybeSingle();

          if (existing) {
            results.push({ quote_date: quoteDate, theme, status: "skipped", quote: existing.quote_text });
            continue;
          }

          const userPrompt = renderTemplate(tmpl.user_prompt_template, {
            quote_date: quoteDate,
            theme,
            category,
            theme_guidance: getThemeGuidance(theme),
          });
          const system = [toneGuidance, tmpl.system_prompt ?? ""].filter(Boolean).join("\n\n");

          async function tryProvider(p: Provider): Promise<{ result: CallResult; model: string } | null> {
            const model = aiModels["quote"]?.[p]
              ?? aiModels["journal_prompts"]?.[p]
              ?? (p === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini");
            const key = p === "anthropic" ? anthropicKey : openaiKey;
            if (!key) return null;
            try {
              const result = p === "anthropic"
                ? await callAnthropic(key, model, system, userPrompt, tmpl.temperature, tmpl.max_tokens)
                : await callOpenAI(key, model, system, userPrompt, tmpl.temperature, tmpl.max_tokens);
              await supabase.from("ai_usage_log").insert({
                provider: p, model, task: "quote",
                called_from: "edge:generate-daily-quote",
                input_tokens: result.input_tokens, output_tokens: result.output_tokens,
                cached_tokens: result.cached_tokens,
                estimated_cost_usd: estimateCost(model, result.input_tokens, result.output_tokens, aiPricing),
                latency_ms: result.latency_ms,
              });
              return { result, model };
            } catch (err) {
              await supabase.from("ai_usage_log").insert({
                provider: p, model, task: "quote",
                called_from: "edge:generate-daily-quote",
                input_tokens: 0, output_tokens: 0, cached_tokens: 0,
                estimated_cost_usd: 0, latency_ms: 0,
                error: err instanceof Error ? err.message.slice(0, 500) : String(err),
              });
              return null;
            }
          }

          let attempt = await tryProvider(primary);
          if (!attempt && fallback !== primary) attempt = await tryProvider(fallback);
          if (!attempt) throw new Error("Both providers failed.");

          const quoteText = cleanQuote(attempt.result.text);
          if (!quoteText) throw new Error("AI returned an empty quote.");

          const { data: insertedQuote, error: insertError } = await supabase
            .from("daily_quotes")
            .insert({
              quote_date: quoteDate, quote_text: quoteText,
              category, tone: "calm", theme, audience: "men",
              model: attempt.model, prompt: userPrompt,
              is_ai_generated: true, is_active: true,
            })
            .select("quote_text, theme").single();
          if (insertError) throw new Error(insertError.message);

          await supabase.from("daily_quote_generation_logs").insert({
            quote_date: quoteDate, status: "success",
            message: `Generated ${theme} quote.`,
            model: attempt.model, prompt: userPrompt,
          });

          results.push({
            quote_date: quoteDate, theme, category,
            status: "success",
            quote: insertedQuote?.quote_text ?? quoteText,
            prompt_version: tmpl.active_version,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await supabase.from("daily_quote_generation_logs").insert({
            quote_date: quoteDate, status: "failed",
            message: errorMessage,
            model: "unknown", prompt: `Theme: ${theme}`,
          });
          results.push({ quote_date: quoteDate, theme, category, status: "failed", error: errorMessage });
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "completed",
        generated_range: { start: getDateString(0), end: getDateString(1) },
        total_attempted: 12, themes, results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
