import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — suggest-external-sources (DB-driven prompts).
 *
 * Reads prompt_templates[external.suggest] + admin_settings on
 * each invocation. Substitutes {{existing_names}}, {{count}},
 * {{focus_block}} into the template, routes through the
 * configured primary provider with fallback, logs to ai_usage_log.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Provider = "anthropic" | "openai";

type Suggestion = {
  name: string;
  base_url: string;
  feed_url: string;
  description: string;
  trust_tier: "high" | "standard" | "caution";
  feed_validated: boolean;
  feed_status?: number | string;
  reasoning?: string;
};

const CANDIDATE_FEED_PATHS = [
  "/feed/", "/feed", "/rss/", "/rss", "/rss.xml", "/feed.xml",
  "/atom.xml", "/blog/feed/", "/news/rss", "/news/feed",
];

async function validateFeed(feedUrl: string): Promise<{ ok: boolean; status: number | string; finalUrl: string }> {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "StoneHarbor-SourceValidator/1.0",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      redirect: "follow",
    });
    if (!res.ok) return { ok: false, status: res.status, finalUrl: res.url };
    const ct = res.headers.get("content-type") || "";
    const text = await res.text();
    const looksLikeFeed = ct.includes("xml") || text.includes("<rss") || text.includes("<feed") || text.includes("<channel>");
    return { ok: looksLikeFeed, status: res.status, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message : String(e), finalUrl: feedUrl };
  }
}

async function tryDiscoverFeed(baseUrl: string): Promise<string | null> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  for (const path of CANDIDATE_FEED_PATHS) {
    const candidate = cleanBase + path;
    const result = await validateFeed(candidate);
    if (result.ok) return candidate;
  }
  return null;
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
      max_tokens: maxTokens ?? 1500,
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
    body: JSON.stringify({ model, max_tokens: maxTokens ?? 1500, temperature: temperature ?? undefined, messages }),
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

    let focus: string | undefined;
    let count = 5;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.focus === "string") focus = body.focus;
        if (typeof body?.count === "number") count = Math.min(8, Math.max(1, body.count));
      } catch (_) {}
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const [{ data: settings }, { data: tmpl }, { data: existing }] = await Promise.all([
      supabase.from("admin_settings")
        .select("ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing, ai_tone_guidance")
        .eq("id", 1).maybeSingle(),
      supabase.from("prompt_templates")
        .select("user_prompt_template, system_prompt, temperature, max_tokens, active_version")
        .eq("slug", "external.suggest").maybeSingle(),
      supabase.from("external_sources").select("name"),
    ]);
    if (!tmpl) {
      return new Response(JSON.stringify({ error: "prompt_templates[external.suggest] missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const primary: Provider = (settings?.ai_primary_provider as Provider) ?? "openai";
    const fallback: Provider = (settings?.ai_fallback_provider as Provider) ?? "anthropic";
    const aiModels = (settings?.ai_models ?? {}) as Record<string, Record<Provider, string>>;
    const aiPricing = (settings?.ai_pricing ?? {}) as Record<string, { input_per_million?: number; output_per_million?: number }>;
    const toneGuidance: string = settings?.ai_tone_guidance ?? "";

    const existingNames = (existing ?? []).map((s: { name: string }) => s.name);

    const userPrompt = renderTemplate(tmpl.user_prompt_template, {
      existing_names: existingNames.join(", ") || "none",
      count: String(count),
      focus_block: focus ? `Focus area: ${focus}` : "",
    });
    const system = [toneGuidance, tmpl.system_prompt ?? ""].filter(Boolean).join("\n\n");

    async function tryProvider(p: Provider): Promise<{ result: CallResult; model: string } | null> {
      const model = aiModels["external"]?.[p]
        ?? aiModels["journal_prompts"]?.[p]
        ?? (p === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o");
      const key = p === "anthropic" ? anthropicKey : openaiKey;
      if (!key) return null;
      try {
        const result = p === "anthropic"
          ? await callAnthropic(key, model, system, userPrompt, tmpl.temperature, tmpl.max_tokens)
          : await callOpenAI(key, model, system, userPrompt, tmpl.temperature, tmpl.max_tokens);
        await supabase.from("ai_usage_log").insert({
          provider: p, model, task: "external",
          called_from: "edge:suggest-external-sources",
          input_tokens: result.input_tokens, output_tokens: result.output_tokens,
          cached_tokens: result.cached_tokens,
          estimated_cost_usd: estimateCost(model, result.input_tokens, result.output_tokens, aiPricing),
          latency_ms: result.latency_ms,
        });
        return { result, model };
      } catch (err) {
        await supabase.from("ai_usage_log").insert({
          provider: p, model, task: "external",
          called_from: "edge:suggest-external-sources",
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

    const arrayMatch = attempt.result.text.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error("Model output did not contain a JSON array");
    const parsed = JSON.parse(arrayMatch[0]) as Array<Omit<Suggestion, "feed_validated" | "feed_status">>;
    const suggestions: Suggestion[] = parsed.map((p) => ({ ...p, feed_validated: false }));

    const validated: Suggestion[] = [];
    for (const s of suggestions) {
      let feedUrl = s.feed_url;
      let result = feedUrl ? await validateFeed(feedUrl) : { ok: false, status: "missing", finalUrl: "" };
      if (!result.ok && s.base_url) {
        const discovered = await tryDiscoverFeed(s.base_url);
        if (discovered) {
          feedUrl = discovered;
          result = await validateFeed(discovered);
        }
      }
      validated.push({ ...s, feed_url: feedUrl, feed_validated: result.ok, feed_status: result.status });
    }

    validated.sort((a, b) => {
      if (a.feed_validated !== b.feed_validated) return a.feed_validated ? -1 : 1;
      const order = { high: 0, standard: 1, caution: 2 };
      return (order[a.trust_tier] ?? 1) - (order[b.trust_tier] ?? 1);
    });

    return new Response(
      JSON.stringify({
        status: "completed",
        suggestions: validated,
        prompt_version: tmpl.active_version,
        provider: attempt ? primary : null,
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
