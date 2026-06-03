import { NextResponse } from "next/server";
import { requireUser, serviceClient, err } from "../_helpers";
import {
  generateChapter1,
  type EidosLocale,
  type Bfi10Scores,
  type SchwartzScores,
  type BpnsfsScores,
} from "@stone-harbor/eidos";
import { retrieveChunks, formatChunksForPrompt } from "@stone-harbor/knowledge";

/**
 * POST /api/map/generate-chapter
 *
 * Generate (or regenerate) Operating Manual Chapter N for the
 * caller, in one or more languages. Phase 1 only supports chapter 1.
 *
 * Pipeline (per call):
 *   1. Auth gate.
 *   2. Read the caller's layer scores from eidos_layer_scores.
 *   3. Read the active eidos.chapter1 prompt template (once).
 *   4. Retrieve grounding chunks from the knowledge corpus (once;
 *      the retrieval query is language-agnostic).
 *   5. For each requested language:
 *      a. Call lib/eidos to assemble the language-specific inputs.
 *      b. Substitute {{vars}} in the template.
 *      c. Call the AI provider (Anthropic primary, OpenAI fallback,
 *         stub if neither key is configured).
 *      d. Persist the row to eidos_chapters (unique on
 *         user_id+chapter_number+language).
 *   6. Return an array of per-language results.
 *
 * Body:
 *   {
 *     chapterNumber?: 1,
 *     // Preferred: multi-language array. Defaults to ["en","es"] so
 *     // members get both versions on a single "Assemble" click. The
 *     // pattern lets a caller request a single language for
 *     // backfill scenarios — e.g. an existing member with only the
 *     // Spanish chapter clicking "Generate in English" from
 *     // /map/operating-manual.
 *     languages?: ("en" | "es")[],
 *     // Legacy single-language form. Honored when `languages` is
 *     // absent; ignored when both are provided.
 *     language?: "en" | "es",
 *     memberName?: string
 *   }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  chapterNumber?: 1;
  languages?: EidosLocale[];
  language?: EidosLocale;
  memberName?: string;
};

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const chapterNumber = body.chapterNumber ?? 1;
  const memberName = (body.memberName ?? "").slice(0, 80);

  // Resolve which languages to generate:
  //   1. `languages` array wins when present (preferred form).
  //   2. Legacy single `language` field is honored for backward compat.
  //   3. Default to both ["en","es"] so a new member gets a complete
  //      Manual on a single Assemble click — Stone Harbor is a bilingual
  //      product, and the cost difference is roughly $0.02/member.
  const requestedLanguages: EidosLocale[] = (() => {
    if (Array.isArray(body.languages) && body.languages.length > 0) {
      // Filter to valid locales + dedupe while preserving order.
      const valid = body.languages.filter(
        (l): l is EidosLocale => l === "en" || l === "es",
      );
      return Array.from(new Set(valid));
    }
    if (body.language === "es" || body.language === "en") {
      return [body.language];
    }
    return ["en", "es"];
  })();

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

  // ---- 2) Pull the active prompt template ----
  const { data: tmpl, error: tmplErr } = await svc
    .from("prompt_templates")
    .select("system_prompt, user_prompt_template, temperature, max_tokens")
    .eq("slug", "eidos.chapter1")
    .maybeSingle();
  if (tmplErr) return err(500, "prompt_fetch_failed", tmplErr.message);
  if (!tmpl) {
    return err(
      500,
      "prompt_missing",
      "eidos.chapter1 template is not seeded — run migration eidos_002.",
    );
  }

  // ---- 3) Retrieve grounding material ONCE (language-agnostic) ----
  // The retrieval query uses the member's starved-need and top-values
  // signal regardless of locale — the knowledge corpus is English-
  // language but the resulting chunks are semantic anchors, not
  // verbatim text. We do this once and reuse across both language
  // generations so we don't pay 2x for retrieval. Failure is non-
  // fatal: empty grounding still produces a coherent chapter.
  const primaryLangInputs = generateChapter1({
    traits,
    values,
    motivation,
    memberName,
    language: requestedLanguages[0],
  }).inputs;

  let groundingMaterial = "";
  try {
    const starved = (primaryLangInputs as Record<string, unknown>).starved_need;
    const topValues = (primaryLangInputs as Record<string, unknown>).top_values;
    const retrievalQuery = [
      "How a man in transition tends to function, what he values, and what tends to feel starved",
      `Starved need right now: ${starved}.`,
      `Strongest values: ${topValues}.`,
    ].join(" ");

    const chunks = await retrieveChunks(svc, {
      query: retrievalQuery,
      topK: 4,
    });
    groundingMaterial = formatChunksForPrompt(chunks);
  } catch (e) {
    console.warn(
      "[map/generate-chapter] knowledge retrieval skipped:",
      e instanceof Error ? e.message : e,
    );
  }

  // ---- 4) Choose AI provider ONCE (Anthropic > OpenAI > stub) ----
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // ---- 5) Loop over languages: substitute, call, persist ----
  type LanguageResult = {
    language: EidosLocale;
    body: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
  };
  const results: LanguageResult[] = [];

  for (const language of requestedLanguages) {
    // Build language-specific inputs (the engine localizes copy + labels).
    const { inputs } = generateChapter1({
      traits,
      values,
      motivation,
      memberName,
      language,
    });
    const inputsWithGrounding: Record<string, unknown> = {
      ...(inputs as unknown as Record<string, unknown>),
      grounding_material: groundingMaterial,
    };
    const systemPrompt = substitute(
      tmpl.system_prompt ?? "",
      inputsWithGrounding,
    );
    const userPrompt = substitute(
      tmpl.user_prompt_template ?? "",
      inputsWithGrounding,
    );

    let body_text: string;
    let model: string;
    let tokensIn = 0;
    let tokensOut = 0;
    let provider: "anthropic" | "openai" | "stub" = "stub";
    const callStart = Date.now();

    if (anthropicKey) {
      try {
        const resp = await callAnthropic({
          apiKey: anthropicKey,
          systemPrompt,
          userPrompt,
          temperature: tmpl.temperature ?? 0.6,
          maxTokens: tmpl.max_tokens ?? 1200,
        });
        body_text = resp.body;
        model = resp.model;
        tokensIn = resp.tokensIn;
        tokensOut = resp.tokensOut;
        provider = "anthropic";
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Anthropic call failed";
        void logUsage(svc, {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          task: "eidos.chapter1",
          calledFrom: "member.api.map.generate-chapter",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - callStart,
          error: msg,
        });
        return err(502, "provider_failed", `[${language}] ${msg}`);
      }
    } else if (openaiKey) {
      try {
        const resp = await callOpenAI({
          apiKey: openaiKey,
          systemPrompt,
          userPrompt,
          temperature: tmpl.temperature ?? 0.6,
          maxTokens: tmpl.max_tokens ?? 1200,
        });
        body_text = resp.body;
        model = resp.model;
        tokensIn = resp.tokensIn;
        tokensOut = resp.tokensOut;
        provider = "openai";
      } catch (e) {
        const msg = e instanceof Error ? e.message : "OpenAI call failed";
        void logUsage(svc, {
          provider: "openai",
          model: "gpt-4o",
          task: "eidos.chapter1",
          calledFrom: "member.api.map.generate-chapter",
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - callStart,
          error: msg,
        });
        return err(502, "provider_failed", `[${language}] ${msg}`);
      }
    } else {
      body_text = stubChapter(inputs);
      model = "stub/no-api-key";
      tokensIn = userPrompt.length;
      tokensOut = body_text.length;
      provider = "stub";
    }

    // Log usage per language so /analytics shows the real spend.
    void logUsage(svc, {
      provider,
      model,
      task: "eidos.chapter1",
      calledFrom: "member.api.map.generate-chapter",
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - callStart,
    });

    // Persist to eidos_chapters. The (user_id, chapter_number,
    // language) unique constraint lets us upsert per language.
    const { error: insertErr } = await svc
      .from("eidos_chapters")
      .upsert(
        {
          user_id: gate.userId,
          chapter_number: chapterNumber,
          language,
          body: body_text,
          inputs: inputs as unknown as Record<string, unknown>,
          model,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,chapter_number,language" },
      );
    if (insertErr) {
      return err(
        500,
        "chapter_persist_failed",
        `[${language}] ${insertErr.message}`,
      );
    }

    results.push({ language, body: body_text, model, tokensIn, tokensOut });
  }

  // Response includes the primary language (first in the request) as
  // a convenience for the existing UI, plus the full results array so
  // a future UI can present a "your manual is now ready in both EN
  // and ES" confirmation.
  const primary = results[0];
  return NextResponse.json({
    ok: true,
    chapterNumber,
    language: primary.language,
    body: primary.body,
    model: primary.model,
    results,
  });
}

// ============================================================
// helpers
// ============================================================

function substitute(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

async function callAnthropic(opts: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<{ body: string; model: string; tokensIn: number; tokensOut: number }> {
  const model = "claude-sonnet-4-6";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userPrompt }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  const body =
    json?.content?.[0]?.text?.trim?.() ??
    json?.content?.map?.((p: { text?: string }) => p.text ?? "")?.join("") ??
    "";
  const tokensIn = json?.usage?.input_tokens ?? 0;
  const tokensOut = json?.usage?.output_tokens ?? 0;
  return { body, model, tokensIn, tokensOut };
}

/**
 * OpenAI fallback for chapter generation. Hits Chat Completions
 * with gpt-4o (strong reasoning, good prose, supports the same
 * system+user message shape the prompt template assumes). Used
 * when ANTHROPIC_API_KEY is not set but OPENAI_API_KEY is.
 *
 * Cost reference: gpt-4o is ~$2.50/M input, ~$10/M output. A
 * chapter is ~3000 input + ~1000 output tokens → roughly $0.018
 * per chapter, same ballpark as Anthropic Sonnet.
 */
async function callOpenAI(opts: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}): Promise<{ body: string; model: string; tokensIn: number; tokensOut: number }> {
  const model = "gpt-4o";
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  const body = (json?.choices?.[0]?.message?.content ?? "").trim();
  const tokensIn = json?.usage?.prompt_tokens ?? 0;
  const tokensOut = json?.usage?.completion_tokens ?? 0;
  return { body, model, tokensIn, tokensOut };
}

/**
 * Fire-and-forget write to ai_usage_log. Mirrors the admin app's
 * helper at stone-harbor-admin/lib/ai.ts so the admin /security AI
 * panel reflects Eidos chapter generations alongside blog drafts
 * and daily quotes. admin_id is null for member-driven calls; the
 * `called_from` field identifies the source.
 *
 * Errors are swallowed so an analytics hiccup never blocks the
 * actual chapter being returned to the member.
 */
async function logUsage(
  svc: ReturnType<typeof serviceClient>,
  row: {
    provider: "anthropic" | "openai" | "stub";
    model: string;
    task: string;
    calledFrom: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    error?: string | null;
  },
): Promise<void> {
  try {
    // Estimated cost is computed against ai_pricing if a matching row
    // exists for this provider/model combination. If not, store 0 —
    // pricing rows can be backfilled later by the admin and the
    // historical token counts remain accurate.
    const { data: priceRow } = await svc
      .from("ai_pricing")
      .select("input_per_million, output_per_million")
      .eq("provider", row.provider)
      .eq("model", row.model)
      .maybeSingle();
    const inputCost = priceRow
      ? (row.tokensIn / 1_000_000) * (priceRow.input_per_million ?? 0)
      : 0;
    const outputCost = priceRow
      ? (row.tokensOut / 1_000_000) * (priceRow.output_per_million ?? 0)
      : 0;
    const estimatedCost = Number((inputCost + outputCost).toFixed(6));

    await svc.from("ai_usage_log").insert({
      provider: row.provider,
      model: row.model,
      task: row.task,
      admin_id: null,
      called_from: row.calledFrom,
      input_tokens: row.tokensIn,
      output_tokens: row.tokensOut,
      cached_tokens: 0,
      estimated_cost_usd: estimatedCost,
      latency_ms: row.latencyMs,
      error: row.error ?? null,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[map/generate-chapter] usage log write failed:", e);
  }
}

/**
 * Stub used when ANTHROPIC_API_KEY is not configured. Returns a
 * recognizable placeholder so the UI flow can be tested. NOT
 * production output.
 */
function stubChapter(inputs: Record<string, unknown>): string {
  return `[Operating Manual — Chapter 1 (STUB)]

Configure ANTHROPIC_API_KEY in .env.local to generate the real chapter.

Inputs assembled for the prompt:

- language: ${inputs.language}
- member_name: ${inputs.member_name || "(empty)"}
- trait_summary: ${inputs.trait_summary}
- top_values: ${inputs.top_values}
- starved_need: ${inputs.starved_need}
- values_context: ${inputs.values_context}
- motivation_context: ${inputs.motivation_context}
`.trim();
}
