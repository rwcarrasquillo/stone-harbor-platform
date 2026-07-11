import { NextResponse } from "next/server";
import { requireUser, serviceClient, err } from "../_helpers";
import {
  generateChapter1,
  type Bfi10Scores,
  type SchwartzScores,
  type BpnsfsScores,
} from "@stone-harbor/eidos";
import { retrieveChunks, formatChunksForPrompt } from "@stone-harbor/knowledge";

/**
 * POST /api/map/generate-chapter
 *
 * Generate (or regenerate) Operating Manual Chapter N for the caller,
 * in both languages. Phase 1 only supports chapter 1.
 *
 * Pipeline (per call):
 *   1. Auth gate.
 *   2. Read the caller's layer scores from eidos_layer_scores.
 *   3. Read the two prompt templates + AI provider config (once).
 *   4. Retrieve grounding chunks from the knowledge corpus (once).
 *   5. Step A — generate the canonical chapter in ENGLISH via the
 *      eidos.chapter1 template. Persist the `en` row.
 *   6. Step B — translate that exact English body into Spanish via the
 *      eidos.chapter1.translate.es template. Persist the `es` row.
 *
 * Why generate-then-translate rather than generate-twice (SH-97):
 *
 *   The previous implementation ran an independent generation per
 *   language. That produced two bugs, both seen in the SH-96 smoke on
 *   2026-07-09: the model sometimes ignored the `Language` directive and
 *   wrote Spanish prose into the `en` row; and even when the language was
 *   right, the two chapters diverged, so a member toggling the language
 *   switch found a materially different chapter — different opening line,
 *   different metaphors, different examples — rather than his own chapter
 *   in another language.
 *
 *   Deriving the Spanish from the English body makes the two rows the same
 *   chapter by construction. This mirrors the letters library's
 *   translate-blog-post flow (SH-95 / PR #55).
 *
 * Both language rows are always written. The request's `languages` field
 * is still accepted for backward compatibility but no longer selects what
 * gets produced: generating `es` alone is not meaningful under this
 * pipeline, since the Spanish chapter is defined as a translation of the
 * English one and so the English generation has to run either way.
 *
 * Provider routing matches the letters library — admin_settings
 * .ai_primary_provider with runtime failover to .ai_fallback_provider, and
 * per-task model selection from admin_settings.ai_models. There is no stub
 * path: if both providers fail the route returns 502 and persists nothing,
 * so placeholder text can never reach the database.
 *
 * Body:
 *   {
 *     chapterNumber?: 1,
 *     memberName?: string,
 *     languages?: ("en" | "es")[],  // accepted, ignored (see above)
 *     language?: "en" | "es"        // legacy, accepted, ignored
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "anthropic" | "openai";
type Task = "eidos.chapter1.generate" | "eidos.chapter1.translate";

type Body = {
  chapterNumber?: 1;
  memberName?: string;
};

/** Used when admin_settings.ai_models has no entry for the task. */
const MODEL_FALLBACKS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
};

/**
 * Provider config, read once per request from admin_settings (id = 1).
 *
 * ai_models and ai_pricing are jsonb COLUMNS on admin_settings, not tables:
 * { task: { provider: model } } and { model: rates } respectively. Same
 * source the letters and psychologist edge functions read.
 */
type AiConfig = {
  primary: Provider;
  fallback: Provider;
  models: Record<string, Partial<Record<Provider, string>>>;
  pricing: Record<
    string,
    { input_per_million?: number; output_per_million?: number }
  >;
};

type ProviderResult = {
  body: string;
  provider: Provider;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  latencyMs: number;
};

type Call = {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const chapterNumber = body.chapterNumber ?? 1;
  const memberName = (body.memberName ?? "").slice(0, 80);

  if (chapterNumber !== 1) {
    return err(400, "unsupported_chapter", "Phase 1 only supports chapter 1.");
  }

  const svc = serviceClient();

  // ---- 1) Pull layer scores ----
  const { data: layers, error: layersErr } = await svc
    .from("eidos_layer_scores")
    .select("layer, scores")
    .eq("user_id", gate.userId);
  if (layersErr) return err(500, "layers_fetch_failed", layersErr.message);

  const byLayer = new Map<string, Record<string, number>>(
    (layers ?? []).map((r) => [r.layer, r.scores as Record<string, number>]),
  );
  const traits = byLayer.get("traits") as Bfi10Scores | undefined;
  const values = byLayer.get("values") as SchwartzScores | undefined;
  const motivation = byLayer.get("motivational") as BpnsfsScores | undefined;

  if (!traits || !values || !motivation) {
    return err(
      409,
      "incomplete_data",
      "Chapter 1 needs traits, values, and motivational layers scored first.",
    );
  }

  // ---- 2) Prompt templates: generation + translation ----
  const chapterTmpl = await loadPromptTemplate(svc, "eidos.chapter1");
  if (!chapterTmpl) {
    return err(
      500,
      "prompt_missing",
      "eidos.chapter1 template is not seeded — run migration eidos_002.",
    );
  }
  const translateTmpl = await loadPromptTemplate(
    svc,
    "eidos.chapter1.translate.es",
  );
  if (!translateTmpl) {
    return err(
      500,
      "prompt_missing",
      "eidos.chapter1.translate.es template is not seeded — run migration eidos_003.",
    );
  }

  // ---- 3) Provider config ----
  const cfg = await loadAiConfig(svc);

  // ---- 4) Assemble the ENGLISH inputs ----
  // The engine localizes copy and labels, but we only ever ask it for `en`.
  // Spanish comes from translating the English body downstream, so the
  // engine's `es` path is intentionally not called here.
  const { inputs } = generateChapter1({
    traits,
    values,
    motivation,
    memberName,
    language: "en",
  });

  // ---- 5) Retrieve grounding material (non-fatal on failure) ----
  // The corpus is English-language and the retrieval query is built from the
  // member's starved-need and top-values signal. Failure is non-fatal: empty
  // grounding still produces a coherent chapter.
  let groundingMaterial = "";
  try {
    const record = inputs as unknown as Record<string, unknown>;
    const retrievalQuery = [
      "How a man in transition tends to function, what he values, and what tends to feel starved",
      `Starved need right now: ${record.starved_need}.`,
      `Strongest values: ${record.top_values}.`,
    ].join(" ");

    const chunks = await retrieveChunks(svc, { query: retrievalQuery, topK: 4 });
    groundingMaterial = formatChunksForPrompt(chunks);
  } catch (e) {
    console.warn(
      "[map/generate-chapter] knowledge retrieval skipped:",
      e instanceof Error ? e.message : e,
    );
  }

  // ============================================================
  // Step A — canonical English generation
  // ============================================================
  const inputsWithGrounding: Record<string, unknown> = {
    ...(inputs as unknown as Record<string, unknown>),
    grounding_material: groundingMaterial,
  };

  let english: ProviderResult;
  try {
    english = await runWithFailover(svc, cfg, "eidos.chapter1.generate", {
      systemPrompt: substitute(
        chapterTmpl.system_prompt ?? "",
        inputsWithGrounding,
      ),
      userPrompt: substitute(
        chapterTmpl.user_prompt_template ?? "",
        inputsWithGrounding,
      ),
      temperature: chapterTmpl.temperature ?? 0.6,
      maxTokens: chapterTmpl.max_tokens ?? 1200,
    });
  } catch (e) {
    return err(
      502,
      "provider_failed",
      `[en] ${e instanceof Error ? e.message : "all providers failed"}`,
    );
  }

  void logUsage(svc, cfg, {
    provider: english.provider,
    model: english.model,
    task: "eidos.chapter1.generate",
    tokensIn: english.tokensIn,
    tokensOut: english.tokensOut,
    cachedTokens: english.cachedTokens,
    latencyMs: english.latencyMs,
  });

  const enErr = await persistChapter(svc, {
    userId: gate.userId,
    chapterNumber,
    language: "en",
    body: english.body,
    inputs: inputs as unknown as Record<string, unknown>,
    result: english,
  });
  if (enErr) return err(500, "chapter_persist_failed", `[en] ${enErr}`);

  // ============================================================
  // Step B — Spanish translation of the English body
  // ============================================================
  //
  // The English row is committed by this point. If the translation fails we
  // return 502 with partialSuccess — a member reading in `en` sees his
  // chapter; a member reading in `es` sees the not-ready state and can hit
  // Assemble again, which re-runs both steps and upserts over the same rows.
  let spanish: ProviderResult;
  try {
    spanish = await runWithFailover(svc, cfg, "eidos.chapter1.translate", {
      systemPrompt: translateTmpl.system_prompt ?? "",
      userPrompt: substitute(translateTmpl.user_prompt_template ?? "", {
        english_body: english.body,
      }),
      temperature: translateTmpl.temperature ?? 0.3,
      maxTokens: translateTmpl.max_tokens ?? 1400,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "translation_failed",
        detail: e instanceof Error ? e.message : "all providers failed",
        partialSuccess: true,
        languages: ["en"],
      },
      { status: 502 },
    );
  }

  void logUsage(svc, cfg, {
    provider: spanish.provider,
    model: spanish.model,
    task: "eidos.chapter1.translate",
    tokensIn: spanish.tokensIn,
    tokensOut: spanish.tokensOut,
    cachedTokens: spanish.cachedTokens,
    latencyMs: spanish.latencyMs,
  });

  // The `es` row records that it is derived rather than independently
  // generated. Keeping the English inputs under `derived_from` means the
  // Spanish row is still traceable back to the scores behind it.
  const esErr = await persistChapter(svc, {
    userId: gate.userId,
    chapterNumber,
    language: "es",
    body: spanish.body,
    inputs: {
      source_language: "en",
      derived_from: inputs as unknown as Record<string, unknown>,
    },
    result: spanish,
  });
  if (esErr) return err(500, "chapter_persist_failed", `[es] ${esErr}`);

  return NextResponse.json({
    ok: true,
    chapterNumber,
    languages: ["en", "es"],
  });
}

// ============================================================
// AI provider plumbing
// ============================================================

/**
 * Run a task against the admin-configured primary provider, falling back to
 * the secondary on any failure — a 5xx, a rate limit, a missing API key, or
 * a response that doesn't look like a chapter.
 *
 * Each failed attempt is written to ai_usage_log with its error, so the
 * admin AI panel shows failover events rather than hiding them. Throws only
 * when BOTH providers fail.
 */
async function runWithFailover(
  svc: ReturnType<typeof serviceClient>,
  cfg: AiConfig,
  task: Task,
  call: Call,
): Promise<ProviderResult> {
  try {
    return await tryProvider(cfg.primary, cfg, task, call);
  } catch (primaryErr) {
    const msg = messageOf(primaryErr);
    console.warn(
      `[map/generate-chapter] ${task}: primary ${cfg.primary} failed, trying ${cfg.fallback}:`,
      msg,
    );
    void logUsage(svc, cfg, {
      provider: cfg.primary,
      model: modelFor(cfg, task, cfg.primary),
      task,
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      latencyMs: 0,
      error: msg,
    });

    try {
      return await tryProvider(cfg.fallback, cfg, task, call);
    } catch (fallbackErr) {
      const fbMsg = messageOf(fallbackErr);
      void logUsage(svc, cfg, {
        provider: cfg.fallback,
        model: modelFor(cfg, task, cfg.fallback),
        task,
        tokensIn: 0,
        tokensOut: 0,
        cachedTokens: 0,
        latencyMs: 0,
        error: fbMsg,
      });
      throw new Error(
        `both providers failed — ${cfg.primary}: ${msg} | ${cfg.fallback}: ${fbMsg}`,
      );
    }
  }
}

async function tryProvider(
  provider: Provider,
  cfg: AiConfig,
  task: Task,
  call: Call,
): Promise<ProviderResult> {
  const apiKey =
    provider === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(`no_key_for_${provider}`);

  const model = modelFor(cfg, task, provider);
  const result =
    provider === "anthropic"
      ? await callAnthropic({ apiKey, model, ...call })
      : await callOpenAI({ apiKey, model, ...call });

  // A provider can answer 200 with an empty body or a refusal. Treat that as
  // a failure so failover fires and a non-chapter never reaches the DB.
  assertLooksLikeChapter(result.body, provider, model);

  return { ...result, provider };
}

/**
 * Chapter 1 is 600–900 words, and a translation of one runs similar. Under
 * ~400 characters means an empty response, a truncation, or a refusal —
 * none of which belong in eidos_chapters.
 */
function assertLooksLikeChapter(
  body: string,
  provider: Provider,
  model: string,
): void {
  const trimmed = body.trim();
  if (trimmed.length < 400) {
    throw new Error(
      `${provider}/${model} returned an unusable body (${trimmed.length} chars): ${
        trimmed.slice(0, 120) || "(empty)"
      }`,
    );
  }
}

/** admin_settings.ai_models is { task: { provider: model } }. */
function modelFor(cfg: AiConfig, task: Task, provider: Provider): string {
  return cfg.models[task]?.[provider] ?? MODEL_FALLBACKS[provider];
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function loadAiConfig(
  svc: ReturnType<typeof serviceClient>,
): Promise<AiConfig> {
  const { data } = await svc
    .from("admin_settings")
    .select("ai_primary_provider, ai_fallback_provider, ai_models, ai_pricing")
    .eq("id", 1)
    .maybeSingle();

  return {
    primary: (data?.ai_primary_provider as Provider) ?? "anthropic",
    fallback: (data?.ai_fallback_provider as Provider) ?? "openai",
    models: (data?.ai_models ?? {}) as AiConfig["models"],
    pricing: (data?.ai_pricing ?? {}) as AiConfig["pricing"],
  };
}

async function loadPromptTemplate(
  svc: ReturnType<typeof serviceClient>,
  slug: string,
): Promise<{
  system_prompt: string | null;
  user_prompt_template: string | null;
  temperature: number | null;
  max_tokens: number | null;
} | null> {
  const { data } = await svc
    .from("prompt_templates")
    .select("system_prompt, user_prompt_template, temperature, max_tokens")
    .eq("slug", slug)
    .maybeSingle();
  return data ?? null;
}

function substitute(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

type CallOpts = Call & { apiKey: string; model: string };
type CallResult = Omit<ProviderResult, "provider">;

async function callAnthropic(opts: CallOpts): Promise<CallResult> {
  const start = Date.now();
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userPrompt }],
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `Anthropic ${resp.status}: ${(await resp.text()).slice(0, 300)}`,
    );
  }
  const json = await resp.json();
  const body: string = ((json?.content ?? []) as { text?: string }[])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return {
    body,
    model: opts.model,
    tokensIn: json?.usage?.input_tokens ?? 0,
    tokensOut: json?.usage?.output_tokens ?? 0,
    cachedTokens:
      (json?.usage?.cache_read_input_tokens ?? 0) +
      (json?.usage?.cache_creation_input_tokens ?? 0),
    latencyMs: Date.now() - start,
  };
}

async function callOpenAI(opts: CallOpts): Promise<CallResult> {
  const start = Date.now();
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `OpenAI ${resp.status}: ${(await resp.text()).slice(0, 300)}`,
    );
  }
  const json = await resp.json();
  return {
    body: (json?.choices?.[0]?.message?.content ?? "").trim(),
    model: opts.model,
    tokensIn: json?.usage?.prompt_tokens ?? 0,
    tokensOut: json?.usage?.completion_tokens ?? 0,
    cachedTokens: json?.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    latencyMs: Date.now() - start,
  };
}

// ============================================================
// Persistence
// ============================================================

/**
 * Upsert one language row. The (user_id, chapter_number, language) unique
 * constraint makes a regenerate overwrite in place. Returns an error
 * message, or null on success.
 */
async function persistChapter(
  svc: ReturnType<typeof serviceClient>,
  row: {
    userId: string;
    chapterNumber: number;
    language: "en" | "es";
    body: string;
    inputs: Record<string, unknown>;
    result: ProviderResult;
  },
): Promise<string | null> {
  const { error } = await svc.from("eidos_chapters").upsert(
    {
      user_id: row.userId,
      chapter_number: row.chapterNumber,
      language: row.language,
      body: row.body,
      inputs: row.inputs,
      model: row.result.model,
      tokens_in: row.result.tokensIn,
      tokens_out: row.result.tokensOut,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chapter_number,language" },
  );
  return error ? error.message : null;
}

/**
 * Fire-and-forget write to ai_usage_log, so the admin /security AI panel
 * reflects Eidos chapter generations alongside blog drafts and quotes.
 * admin_id is null for member-driven calls; `called_from` identifies the
 * source. Errors are swallowed — an analytics hiccup must never block a
 * chapter that was actually produced.
 *
 * Pricing comes from admin_settings.ai_pricing, a jsonb column keyed by
 * model. The previous implementation queried a nonexistent `ai_pricing`
 * TABLE, so every Chapter 1 row logged estimated_cost_usd = 0.
 */
async function logUsage(
  svc: ReturnType<typeof serviceClient>,
  cfg: AiConfig,
  row: {
    provider: Provider;
    model: string;
    task: Task;
    tokensIn: number;
    tokensOut: number;
    cachedTokens: number;
    latencyMs: number;
    error?: string | null;
  },
): Promise<void> {
  try {
    const rates = cfg.pricing[row.model];
    const estimatedCost = rates
      ? Number(
          (
            (row.tokensIn / 1_000_000) * (rates.input_per_million ?? 0) +
            (row.tokensOut / 1_000_000) * (rates.output_per_million ?? 0)
          ).toFixed(6),
        )
      : 0;

    await svc.from("ai_usage_log").insert({
      provider: row.provider,
      model: row.model,
      task: row.task,
      admin_id: null,
      called_from: "member.api.map.generate-chapter",
      input_tokens: row.tokensIn,
      output_tokens: row.tokensOut,
      cached_tokens: row.cachedTokens,
      estimated_cost_usd: estimatedCost,
      latency_ms: row.latencyMs,
      error: row.error ?? null,
    });
  } catch (e) {
    console.error("[map/generate-chapter] usage log write failed:", e);
  }
}
