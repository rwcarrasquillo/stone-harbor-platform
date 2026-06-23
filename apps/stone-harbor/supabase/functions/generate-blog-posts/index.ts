// apps/stone-harbor/supabase/functions/generate-blog-posts/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Stone Harbor — generate-blog-posts (SH-85 Phase 2: agentic loop).
 *
 * Replaces the prior one-shot bilingual generator with a 4-agent loop that
 * generates against the editorial canon and self-corrects against the
 * quality scorer:
 *
 *   Strategist (rule-based) — picks the next under-covered canon angle for
 *     a (pillar, language) from editorial_canon_angles, using the count of
 *     succeeded editorial_assignments vs. blog_library_target_per_angle.
 *
 *   Writer (Claude Sonnet primary, OpenAI fallback) — writes a Letter from
 *     the Harbor that develops the assigned angle. The pillar voice template
 *     (blog.{pillar}.{lang}) is the harbor-voice SYSTEM prompt; the canon
 *     assignment is injected into the USER prompt. The therapeutic substrate
 *     is Writer-priming only — never named in the letter.
 *
 *   Critic (HTTP → score-blog-draft) — scores the draft on the 5-dimension
 *     rubric (incl. therapeutic_depth) and writes blog_draft_scores.
 *
 *   Reviser (loops up to max_revisions) — if the draft fails hard rules, the
 *     overall threshold, or therapeutic_depth < 7, it is revised in place
 *     (translation row overwritten) against the specific failing dimensions,
 *     then re-scored.
 *
 * On final pass: editorial_assignments.succeeded=true, post_id linked, scorer
 * fields recorded. On final fail after revisions: the blog_posts +
 * blog_post_translations rows are DELETED (no point keeping a sub-threshold
 * draft — it regenerates next call) and the assignment is marked failed with
 * a reason. The orphaned blog_draft_scores row is intentionally kept for
 * post-mortem (matches the no-FK design in blog_001_draft_scores.sql).
 *
 * Request body (all optional):
 *   { pillar?, language?, max_revisions?=2, count?=1 }
 *     pillar:   "clarity" | "calm" | "strength" — default: all three
 *     language: "en" | "es" | ["en","es"]       — default: both
 *     max_revisions: number                       — default 2
 *     count:    number — letters per (pillar, language) — default 1
 *
 * If admin_settings.blog_library_complete = true, returns immediately with
 * { status: "skipped", reason: "library complete" } and the daily cron noops.
 *
 * NOTE on the assignment lifecycle: the scorer fetches the substrate by
 * looking up the assignment via (post_id, succeeded=true). So we link the
 * post_id and flip succeeded=true OPTIMISTICALLY right after the draft is
 * inserted — otherwise the Critic would score therapeutic_depth against the
 * generic substrate fallback instead of the assigned one. On final failure
 * we flip it back to false. Execution within a call is sequential, so
 * Strategist counts stay accurate between generations.
 *
 * Provider routing reuses admin_settings.ai_primary_provider /
 * .ai_fallback_provider / .ai_models / .ai_pricing. Logs to ai_usage_log
 * under task "blog", called_from "edge:generate-blog-posts:{lang}".
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

const PILLAR_ES: Record<Pillar, string> = {
  clarity: "la Claridad",
  calm: "la Calma",
  strength: "la Fortaleza",
};

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
  // Title:/Summary: markers stay in English even for Spanish letters — the
  // Writer is instructed to keep them as parseable tokens regardless of body
  // language.
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

type Ctx = {
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  serviceKey: string;
  primary: Provider;
  fallback: Provider;
  anthropicKey: string | undefined;
  openaiKey: string | undefined;
  aiModels: Record<string, Record<Provider, string>>;
  aiPricing: Record<string, { input_per_million?: number; output_per_million?: number }>;
  toneGuidance: string;
  threshold: number;
  targetPerAngle: number;
};

type Angle = {
  id: string;
  angle_name: string;
  harbor_framing: string;
  therapeutic_substrate: string;
  embodiment_instruction: string;
};

/**
 * Strategist — pick the next under-covered active angle for (pillar, lang).
 * Returns null when every angle for the pillar has reached the target count.
 */
async function pickNextAngle(ctx: Ctx, pillar: Pillar, language: Lang): Promise<Angle | null> {
  const { data: angles } = await ctx.supabase
    .from("editorial_canon_angles")
    .select("id, angle_name, harbor_framing, therapeutic_substrate, embodiment_instruction")
    .eq("pillar", pillar)
    .eq("is_active", true)
    .order("display_order");
  const angleList = (angles ?? []) as Angle[];
  if (angleList.length === 0) return null;

  const { data: assignments } = await ctx.supabase
    .from("editorial_assignments")
    .select("angle_id")
    .eq("language", language)
    .eq("succeeded", true);

  const counts = new Map<string, number>();
  for (const a of (assignments ?? []) as { angle_id: string }[]) {
    counts.set(a.angle_id, (counts.get(a.angle_id) ?? 0) + 1);
  }

  const undercovered = angleList.filter((a) => (counts.get(a.id) ?? 0) < ctx.targetPerAngle);
  if (undercovered.length === 0) return null;

  const minCount = Math.min(...undercovered.map((a) => counts.get(a.id) ?? 0));
  const candidates = undercovered.filter((a) => (counts.get(a.id) ?? 0) === minCount);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * SH-90 — fetch prior succeeded letters at the SAME (angle_id, language) so the
 * Writer can be told to diverge from them. Returns title + opening (first 800
 * chars) per prior, in attempt order.
 *
 * Two queries rather than a PostgREST embed: editorial_assignments and
 * blog_post_translations have no direct FK between them (both only FK to
 * blog_posts), so an `editorial_assignments → blog_post_translations` embed
 * won't resolve. Querying translations separately also lets us filter by
 * language explicitly — a bilingual post otherwise returns both translations.
 *
 * The current in-flight generation is excluded naturally: its assignment is
 * still succeeded=false at this point (it's flipped true only after the draft
 * inserts), and failed/deleted attempts are reverted to succeeded=false.
 */
async function fetchPriorLettersForAngle(
  ctx: Ctx, angle_id: string, language: Lang,
): Promise<Array<{ title: string; opening: string }>> {
  const { data: assigns } = await ctx.supabase
    .from("editorial_assignments")
    .select("post_id, attempted_at")
    .eq("angle_id", angle_id)
    .eq("language", language)
    .eq("succeeded", true)
    .not("post_id", "is", null)
    .order("attempted_at", { ascending: true });
  const postIds = ((assigns ?? []) as { post_id: string | null }[])
    .map((a) => a.post_id)
    .filter((id): id is string => !!id);
  if (postIds.length === 0) return [];

  const { data: trs } = await ctx.supabase
    .from("blog_post_translations")
    .select("post_id, title, content")
    .in("post_id", postIds)
    .eq("language", language);
  // deno-lint-ignore no-explicit-any
  const byPost = new Map<string, any>(
    ((trs ?? []) as any[]).map((t) => [t.post_id as string, t]),
  );

  const out: Array<{ title: string; opening: string }> = [];
  for (const id of postIds) {
    const t = byPost.get(id);
    if (t?.title && t?.content) {
      out.push({ title: t.title as string, opening: (t.content as string).slice(0, 800) });
    }
  }
  return out;
}

/**
 * SH-90 — build the "PRIOR LETTERS AT THIS ANGLE" diversity block (language
 * aware). Empty string when there are no priors, so the first letter at each
 * angle gets the unchanged prompt. Leads with newlines so it can be injected
 * directly after the assignment paragraph.
 */
function buildDiversityContext(
  priors: Array<{ title: string; opening: string }>,
  language: Lang,
): string {
  if (priors.length === 0) return "";
  if (language === "es") {
    const list = priors
      .map((p, i) => `${i + 1}. Título: ${p.title}\n   Apertura: ${p.opening}`)
      .join("\n\n");
    return `

CARTAS PREVIAS EN ESTE ÁNGULO (debes tomar un enfoque sustancialmente diferente):

${list}

Tu carta debe:
- Abrir en un dominio diferente (si la previa abrió en una cocina, tú abres en un carro o jardín o taller o calle — no el mismo dominio)
- Desarrollar un momento específico sustancialmente diferente dentro del territorio de este ángulo
- Usar un registro metafórico diferente (si la previa usó imágenes acuáticas, tú usas piedra, madera, luz, clima)
- Aterrizar en una imagen de cierre específica diferente

El sustrato terapéutico y la instrucción de encarnación permanecen iguales — tu trabajo es encontrar una ejecución DIFERENTE del mismo movimiento psicológico.`;
  }
  const list = priors
    .map((p, i) => `${i + 1}. Title: ${p.title}\n   Opening: ${p.opening}`)
    .join("\n\n");
  return `

PRIOR LETTERS AT THIS ANGLE (you must take a substantively different approach):

${list}

Your letter must:
- Open in a different domain (if prior opened in a kitchen, you open in a car or garden or workshop or street — not the same domain)
- Develop a substantively different specific moment within this angle's territory
- Use different metaphoric register (if prior used water imagery, you use stone, wood, light, weather)
- Land on a different specific closing image

The therapeutic substrate and embodiment instruction remain the same — your job is to find a DIFFERENT execution of the same psychological move.`;
}

/** Build the Writer's user prompt with the canon assignment injected. */
function buildWriterPrompt(
  pillar: Pillar, language: Lang, angle: Angle, diversityBlock = "",
): string {
  if (language === "es") {
    // Framing wrappers + instruction-to-the-Writer translate; the substrate
    // and embodiment_instruction stay in English (clinical guidance).
    return `Escribe una Carta desde la Dársena sobre el territorio de ${PILLAR_ES[pillar]}.

ENCARGO EDITORIAL (del canon de la dársena):
- Ángulo: ${angle.angle_name}
- Encuadre de la dársena: ${angle.harbor_framing}
- Sustrato terapéutico (NUNCA lo nombres en la carta — solo es orientación para ti, el escritor): ${angle.therapeutic_substrate}
- Instrucción de encarnación: ${angle.embodiment_instruction}

Desarrolla este ángulo y SOLO este ángulo. El lector debe experimentar el sustrato como un reconocimiento preciso de su interior, no como una instrucción.${diversityBlock}

Escribe en español nativo (no una traducción literal), en la voz de la dársena. Dirígete al lector como "tú" — nunca "usted".

Devuelve exactamente este formato y nada más. Los marcadores Title: y Summary: permanecen en inglés (los lee un parser); el contenido va en español:
Title: <título literario en español, 4 a 9 palabras, sin comillas>
Summary: <una oración en español, 12 a 20 palabras, sin comillas>

<el cuerpo en español, 700-1000 palabras, solo prosa plana>`;
  }
  return `Write a Letter from the Harbor on the territory of ${pillar}.

EDITORIAL ASSIGNMENT (from the harbor's canon):
- Angle: ${angle.angle_name}
- Harbor framing: ${angle.harbor_framing}
- Therapeutic substrate (NEVER name in letter — Writer priming only): ${angle.therapeutic_substrate}
- Embodiment instruction: ${angle.embodiment_instruction}

Develop this angle and ONLY this angle. The reader should experience the substrate as accurate recognition of their interior, not as instruction.${diversityBlock}

Return strict format:
Title: <literary title, 4-9 words, sentence case>
Summary: <one sentence, 12-20 words>

<body, 700-1000 words, plain prose>`;
}

/** Build the Reviser's user prompt from the failing dimensions + hard rules. */
function buildReviserPrompt(
  language: Lang, title: string, body: string,
  failing: { name: string; score: unknown; reasoning: string }[],
  violations: string[],
): string {
  const dims = failing.map((d) => `${d.name}: ${d.score}/10 — ${d.reasoning}`).join("\n");
  const hard = violations.length ? `\nHard-rule violations:\n${violations.join("\n")}\n` : "";
  if (language === "es") {
    return `Escribiste esta carta:

Title: ${title}

${body}

El Crítico la evaluó. Dimensiones que fallaron:
${dims}${hard}
Revisa esta carta. Atiende específicamente los fallos listados arriba. NO la reescribas desde cero — conserva lo que funciona. Corrige cada fallo con un cambio puntual.

Se aplican las mismas reglas de la voz de la dársena — encarna la sabiduría, nunca nombres el marco terapéutico; sin instrucciones ni prescripciones al lector; sin clichés; sin markdown ni separadores. Dirígete al lector como "tú", nunca "usted".

Devuelve exactamente este formato (los marcadores Title:/Summary: en inglés, el contenido en español):
Title: <puede mantenerse o revisarse>
Summary: <puede mantenerse o revisarse>

<el cuerpo revisado en español, 700-1000 palabras, solo prosa plana>`;
  }
  return `You wrote this letter:

Title: ${title}

${body}

The Critic scored it. Specific failing dimensions:
${dims}${hard}
Revise this letter. Specifically address the failures listed above. Do NOT rewrite from scratch — preserve what works. Address each failure with a targeted change.

The same harbor voice rules apply — embody the wisdom, never cite the framework; no instructions or prescriptions to the reader; no clichés; no markdown headings, bullets, or separator marks.

Return strict format:
Title: <may keep same or revise>
Summary: <may keep same or revise>

<revised body, 700-1000 words, plain prose>`;
}

/** Run the provider chain (primary → fallback), logging usage either way. */
async function generate(
  ctx: Ctx, system: string, user: string, lang: Lang,
  temperature: number | null, maxTokens: number | null,
): Promise<{ text: string; model: string; provider: Provider } | null> {
  const order: Provider[] = ctx.fallback !== ctx.primary
    ? [ctx.primary, ctx.fallback]
    : [ctx.primary];
  for (const p of order) {
    const model = ctx.aiModels["blog"]?.[p] ?? (p === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o");
    const key = p === "anthropic" ? ctx.anthropicKey : ctx.openaiKey;
    if (!key) continue;
    try {
      const result = p === "anthropic"
        ? await callAnthropic(key, model, system, user, temperature, maxTokens)
        : await callOpenAI(key, model, system, user, temperature, maxTokens);
      await ctx.supabase.from("ai_usage_log").insert({
        provider: p, model, task: "blog",
        called_from: `edge:generate-blog-posts:${lang}`,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cached_tokens: result.cached_tokens,
        estimated_cost_usd: estimateCost(model, result.input_tokens, result.output_tokens, ctx.aiPricing),
        latency_ms: result.latency_ms,
      });
      return { text: result.text, model, provider: p };
    } catch (err) {
      await ctx.supabase.from("ai_usage_log").insert({
        provider: p, model, task: "blog",
        called_from: `edge:generate-blog-posts:${lang}`,
        input_tokens: 0, output_tokens: 0, cached_tokens: 0,
        estimated_cost_usd: 0, latency_ms: 0,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
    }
  }
  return null;
}

type Evaluation = {
  scored: boolean;
  overall: number;
  therapeuticDepth: number;
  hardOk: boolean;
  pass: boolean;
  failing: { name: string; score: unknown; reasoning: string }[];
  violations: string[];
};

/** Critic — score via HTTP, then read blog_draft_scores and evaluate. */
async function criticEvaluate(ctx: Ctx, post_id: string, language: Lang): Promise<Evaluation> {
  const empty: Evaluation = {
    scored: false, overall: 0, therapeuticDepth: 0, hardOk: false,
    pass: false, failing: [], violations: [],
  };
  try {
    const res = await fetch(`${ctx.supabaseUrl}/functions/v1/score-blog-draft`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ post_id, language }),
    });
    if (!res.ok) return empty;
    const j = await res.json();
    const outcome = j.results?.[0];
    if (!outcome || outcome.status !== "scored") return empty;
  } catch (_) {
    return empty;
  }

  const { data: scoreRow } = await ctx.supabase
    .from("blog_draft_scores")
    .select("overall_score, hard_rules_passed, passed_threshold, scales, hard_rules")
    .eq("post_id", post_id)
    .eq("language", language)
    .maybeSingle();
  if (!scoreRow) return empty;

  // deno-lint-ignore no-explicit-any
  const scales = ((scoreRow as any).scales ?? {}) as Record<string, any>;
  // deno-lint-ignore no-explicit-any
  const hr = ((scoreRow as any).hard_rules ?? {}) as Record<string, any>;
  const overall = Number((scoreRow as any).overall_score ?? 0);
  const therapeuticDepth = Number(scales.therapeutic_depth ?? 0);
  const hardOk = (scoreRow as any).hard_rules_passed === true;

  const dimKeys = [
    "witnessing_register",
    "grounding",
    "competitive_bar",
    "therapeutic_depth",
    language === "es" ? "native_cadence" : "prose_quality",
  ];
  const failing = dimKeys
    .filter((k) => Number(scales[k] ?? 10) < 7)
    .map((k) => ({
      name: k,
      score: scales[k],
      reasoning: String(scales[`${k}_reasoning`] ?? ""),
    }));

  const violations: string[] = [];
  if (hr.word_count_ok === false) violations.push(`word_count out of range (${hr.word_count})`);
  if (hr.forbidden_phrases_ok === false) {
    violations.push(`forbidden phrases: ${(hr.forbidden_phrases_found ?? []).join(", ")}`);
  }
  if (hr.pillar_coherence_ok === false) {
    violations.push(`pillar coherence: ${hr.pillar_coherence_reasoning ?? ""}`);
  }
  if (language === "es" && hr.usted_ok === false) violations.push(`uses "usted" (${hr.usted_count})`);

  const pass = hardOk && overall >= ctx.threshold && therapeuticDepth >= 7;
  return { scored: true, overall, therapeuticDepth, hardOk, pass, failing, violations };
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

    // Parse request body.
    let requestedPillars: Pillar[] = PILLARS;
    let requestedLanguages: Lang[] = LANGS;
    let maxRevisions = 2;
    let count = 1;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.pillar === "string") {
          const p = body.pillar.toLowerCase();
          if (PILLARS.includes(p as Pillar)) requestedPillars = [p as Pillar];
        }
        if (body && typeof body.language === "string" && LANGS.includes(body.language as Lang)) {
          requestedLanguages = [body.language as Lang];
        } else if (body && Array.isArray(body.language)) {
          const ls = body.language.filter((l: unknown): l is Lang =>
            typeof l === "string" && LANGS.includes(l as Lang));
          if (ls.length > 0) requestedLanguages = ls;
        }
        if (body && Number.isFinite(body.max_revisions)) {
          maxRevisions = Math.max(0, Math.min(5, Math.floor(body.max_revisions)));
        }
        if (body && Number.isFinite(body.count)) {
          count = Math.max(1, Math.min(10, Math.floor(body.count)));
        }
      } catch (_) { /* default config */ }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: settings } = await supabase
      .from("admin_settings")
      .select(
        "ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing, ai_tone_guidance, blog_library_complete, blog_library_target_per_angle, blog_quality_gate_threshold",
      )
      .eq("id", 1)
      .maybeSingle();

    // Library complete → noop (the daily cron lands here once the founder
    // flips the flag after reviewing the initial library).
    if ((settings as any)?.blog_library_complete === true) {
      await supabase.from("blog_generation_logs").insert({
        pillar: requestedPillars[0],
        status: "skipped",
        message: "library complete — generation noop",
      });
      return new Response(JSON.stringify({ status: "skipped", reason: "library complete" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx: Ctx = {
      supabase,
      supabaseUrl,
      serviceKey,
      primary: ((settings as any)?.ai_primary_provider as Provider) ?? "anthropic",
      fallback: ((settings as any)?.ai_fallback_provider as Provider) ?? "openai",
      anthropicKey,
      openaiKey,
      aiModels: ((settings as any)?.ai_models ?? {}) as Record<string, Record<Provider, string>>,
      aiPricing: ((settings as any)?.ai_pricing ?? {}) as Record<string, { input_per_million?: number; output_per_million?: number }>,
      toneGuidance: (settings as any)?.ai_tone_guidance ?? "",
      threshold: Number((settings as any)?.blog_quality_gate_threshold ?? 7.0),
      targetPerAngle: Number((settings as any)?.blog_library_target_per_angle ?? 2),
    };

    const results: Array<Record<string, unknown>> = [];

    for (const pillar of requestedPillars) {
      // Load the pillar voice template once per (pillar, language) below.
      for (const language of requestedLanguages) {
        const slug = `blog.${pillar}.${language}`;
        const { data: tmpl } = await supabase
          .from("prompt_templates")
          .select("system_prompt, user_prompt_template, temperature, max_tokens")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();
        if (!tmpl) {
          results.push({ pillar, language, status: "failed", error: `voice template ${slug} not found` });
          continue;
        }
        // The pillar template is the harbor-voice SYSTEM prompt. Prefer the
        // dedicated system_prompt; fall back to the (rendered) user template.
        const voice = (tmpl as any).system_prompt
          ? renderTemplate((tmpl as any).system_prompt, { pillar })
          : renderTemplate((tmpl as any).user_prompt_template ?? "", { pillar });
        const system = [ctx.toneGuidance, voice].filter(Boolean).join("\n\n");
        const temperature = (tmpl as any).temperature ?? null;
        const maxTokens = (tmpl as any).max_tokens ?? null;

        for (let i = 0; i < count; i++) {
          // ── Strategist ──────────────────────────────────────────────
          const angle = await pickNextAngle(ctx, pillar, language);
          if (!angle) {
            results.push({ pillar, language, status: "pillar_complete" });
            break; // no point looping `count` more times for this pillar/lang
          }

          // Log the attempt up-front (succeeded=false, no post yet).
          const { data: assignmentRow } = await supabase
            .from("editorial_assignments")
            .insert({
              angle_id: angle.id,
              language,
              attempted_at: new Date().toISOString(),
              succeeded: false,
            })
            .select("id")
            .single();
          const assignmentId = (assignmentRow as any)?.id as string | undefined;

          // ── Writer ──────────────────────────────────────────────────
          // SH-90: when this angle already has succeeded letters in this
          // language, show the Writer their openings and require a different
          // execution — bakes intra-angle diversity into the first draft.
          const priors = await fetchPriorLettersForAngle(ctx, angle.id, language);
          const diversityBlock = buildDiversityContext(priors, language);
          const writerUser = buildWriterPrompt(pillar, language, angle, diversityBlock);
          const written = await generate(ctx, system, writerUser, language, temperature, maxTokens);
          if (!written) {
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({ failure_reason: "writer: both providers failed" })
                .eq("id", assignmentId);
            }
            results.push({ pillar, language, status: "failed", error: "writer: both providers failed", angle_name: angle.angle_name });
            continue;
          }

          let parsed: { title: string; summary: string; body: string };
          try {
            parsed = parseResponse(written.text);
          } catch (err) {
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({ failure_reason: `writer parse: ${err instanceof Error ? err.message : String(err)}` })
                .eq("id", assignmentId);
            }
            results.push({ pillar, language, status: "failed", error: `writer parse failed`, angle_name: angle.angle_name });
            continue;
          }

          // Insert parent + this-language translation.
          const { data: inserted, error: insErr } = await supabase
            .from("blog_posts")
            .insert({
              title: parsed.title,
              excerpt: parsed.summary,
              summary: parsed.summary,
              content: parsed.body,
              is_published: false,
              pillar,
              category: "Recovery",
              is_ai_generated: true,
              model: written.model,
              prompt: writerUser,
              cover_image_url: null,
              consumer: "stone_harbor",
            })
            .select("id")
            .single();
          if (insErr || !inserted) {
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({ failure_reason: `blog_posts insert: ${insErr?.message ?? "no row"}` })
                .eq("id", assignmentId);
            }
            results.push({ pillar, language, status: "failed", error: `blog_posts insert failed`, angle_name: angle.angle_name });
            continue;
          }
          const postId = (inserted as any).id as string;

          const { error: trErr } = await supabase
            .from("blog_post_translations")
            .insert({
              post_id: postId,
              language,
              title: parsed.title,
              excerpt: parsed.summary,
              summary: parsed.summary,
              content: parsed.body,
              slug: null,
              is_published: false,
            });
          if (trErr) {
            await supabase.from("blog_posts").delete().eq("id", postId);
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({ failure_reason: `translation insert: ${trErr.message}` })
                .eq("id", assignmentId);
            }
            results.push({ pillar, language, status: "failed", error: `translation insert failed`, angle_name: angle.angle_name });
            continue;
          }

          // Link the assignment + flip succeeded=true OPTIMISTICALLY so the
          // scorer can read the assigned substrate for therapeutic_depth.
          // Reverted to false on final failure below.
          if (assignmentId) {
            await supabase.from("editorial_assignments")
              .update({ post_id: postId, succeeded: true })
              .eq("id", assignmentId);
          }

          // ── Critic + Reviser loop ───────────────────────────────────
          let evalResult = await criticEvaluate(ctx, postId, language);
          let revisions = 0;
          while (!evalResult.pass && revisions < maxRevisions && evalResult.scored) {
            revisions++;
            // Re-read the current translation body (it was overwritten on a
            // prior pass; on the first revision it's the Writer's output).
            const { data: cur } = await supabase
              .from("blog_post_translations")
              .select("title, content")
              .eq("post_id", postId)
              .eq("language", language)
              .maybeSingle();
            const curTitle = (cur as any)?.title ?? parsed.title;
            const curBody = (cur as any)?.content ?? parsed.body;

            const reviserUser = buildReviserPrompt(
              language, curTitle, curBody, evalResult.failing, evalResult.violations,
            );
            const revised = await generate(ctx, system, reviserUser, language, temperature, maxTokens);
            if (!revised) break;
            let parsed2: { title: string; summary: string; body: string };
            try {
              parsed2 = parseResponse(revised.text);
            } catch (_) {
              break; // keep the prior version; loop ends, finalize as fail
            }
            await supabase.from("blog_post_translations")
              .update({
                title: parsed2.title,
                excerpt: parsed2.summary,
                summary: parsed2.summary,
                content: parsed2.body,
              })
              .eq("post_id", postId)
              .eq("language", language);
            // Keep blog_posts legacy columns in sync with the revised text.
            await supabase.from("blog_posts")
              .update({ title: parsed2.title, excerpt: parsed2.summary, summary: parsed2.summary, content: parsed2.body, model: revised.model })
              .eq("id", postId);

            evalResult = await criticEvaluate(ctx, postId, language);
          }

          // ── Finalize ────────────────────────────────────────────────
          if (evalResult.pass) {
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({
                  succeeded: true,
                  post_id: postId,
                  scorer_overall: evalResult.overall,
                  // scorer_therapeutic_depth is an integer column — round the
                  // scorer's 1-10 value defensively.
                  scorer_therapeutic_depth: Math.round(evalResult.therapeuticDepth),
                })
                .eq("id", assignmentId);
            }
            // Re-read the final title (may have been revised).
            const { data: fin } = await supabase
              .from("blog_post_translations")
              .select("title")
              .eq("post_id", postId)
              .eq("language", language)
              .maybeSingle();
            results.push({
              pillar,
              language,
              status: "success",
              post_id: postId,
              angle_id: angle.id,
              angle_name: angle.angle_name,
              title: (fin as any)?.title ?? parsed.title,
              overall_score: evalResult.overall,
              therapeutic_depth: evalResult.therapeuticDepth,
              revisions,
            });
          } else {
            const reason = `Failed after ${revisions} revision(s): overall=${evalResult.overall} (threshold ${ctx.threshold}), therapeutic_depth=${evalResult.therapeuticDepth}. Failing: ${evalResult.failing.map((f) => `${f.name}=${f.score}`).join(", ") || "n/a"}. Hard: ${evalResult.violations.join("; ") || "none"}`;
            // Drop the sub-threshold draft. The orphaned blog_draft_scores
            // row is intentionally retained for post-mortem.
            await supabase.from("blog_post_translations").delete().eq("post_id", postId);
            await supabase.from("blog_posts").delete().eq("id", postId);
            if (assignmentId) {
              await supabase.from("editorial_assignments")
                .update({ succeeded: false, post_id: null, failure_reason: reason.slice(0, 1000) })
                .eq("id", assignmentId);
            }
            results.push({
              pillar,
              language,
              status: "failed",
              angle_id: angle.id,
              angle_name: angle.angle_name,
              reason,
              revisions,
            });
          }
        }
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
