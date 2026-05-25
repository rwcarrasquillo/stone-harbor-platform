import { NextResponse } from "next/server";
import { requireUser, serviceClient, err } from "../_helpers";
import {
  generateChapter1,
  type EidosLocale,
  type Bfi10Scores,
  type SchwartzScores,
  type BpnsfsScores,
} from "@/lib/eidos";
import { retrieveChunks, formatChunksForPrompt } from "@/lib/knowledge";

/**
 * POST /api/map/generate-chapter
 *
 * Generate (or regenerate) Operating Manual Chapter N for the
 * caller. Phase 1 only supports chapter 1.
 *
 * Pipeline:
 *   1. Auth gate.
 *   2. Read the caller's layer scores from eidos_layer_scores.
 *   3. Read the active eidos.chapter1 prompt template from
 *      prompt_templates.
 *   4. Call lib/eidos to assemble the prompt inputs.
 *   5. Substitute {{vars}} in the template.
 *   6. Call Anthropic. (If ANTHROPIC_API_KEY is missing, fall back to
 *      a stubbed response so the UI flow can be tested without the
 *      external dependency.)
 *   7. Persist to eidos_chapters.
 *
 * Body:
 *   { chapterNumber?: 1, language?: "en" | "es", memberName?: string }
 *
 * Defaults: chapterNumber = 1, language = "en", memberName = "".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  chapterNumber?: 1;
  language?: EidosLocale;
  memberName?: string;
};

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if ("response" in gate) return gate.response;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as Body;
  const chapterNumber = body.chapterNumber ?? 1;
  const language: EidosLocale = body.language === "es" ? "es" : "en";
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

  // ---- 3) Assemble inputs via the engine ----
  const { inputs } = generateChapter1({
    traits,
    values,
    motivation,
    memberName,
    language,
  });

  // ---- 3.5) Retrieve grounding material from the knowledge corpus ----
  // Build a query from the member's signals so retrieval is keyed to
  // their actual situation rather than generic "men's wellness." The
  // chunks are passed in as {{grounding_material}} for the chapter
  // generator to cite. Failure here is non-fatal: if retrieval can't
  // produce chunks, the chapter generates without grounding (the
  // prompt's system message handles the empty case).
  let groundingMaterial = "";
  try {
    const starved = (inputs as Record<string, unknown>).starved_need;
    const topValues = (inputs as Record<string, unknown>).top_values;
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

  const inputsWithGrounding: Record<string, unknown> = {
    ...(inputs as unknown as Record<string, unknown>),
    grounding_material: groundingMaterial,
  };

  // ---- 4) Substitute {{vars}} in the template ----
  const systemPrompt = substitute(tmpl.system_prompt ?? "", inputsWithGrounding);
  const userPrompt = substitute(tmpl.user_prompt_template ?? "", inputsWithGrounding);

  // ---- 5) Call the AI provider. Pick by env-var availability:
  //         ANTHROPIC_API_KEY wins if present (canonical primary).
  //         OPENAI_API_KEY is the fallback (matches the admin app's
  //         "Anthropic primary, OpenAI fallback" pattern in lib/ai.ts).
  //         If neither is set, the stub fires so the UI loop is
  //         testable without external dependencies.
  //         Every path logs usage to ai_usage_log so the admin
  //         /security AI panel reflects Eidos spend. ----
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  let body_text: string;
  let model: string;
  let tokensIn = 0;
  let tokensOut = 0;
  let provider: "anthropic" | "openai" | "stub" = "stub";
  let providerErr: string | null = null;
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
      providerErr = e instanceof Error ? e.message : "Anthropic call failed";
      void logUsage(svc, {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        task: "eidos.chapter1",
        calledFrom: "member.api.map.generate-chapter",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - callStart,
        error: providerErr,
      });
      return err(502, "provider_failed", providerErr);
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
      providerErr = e instanceof Error ? e.message : "OpenAI call failed";
      void logUsage(svc, {
        provider: "openai",
        model: "gpt-4o",
        task: "eidos.chapter1",
        calledFrom: "member.api.map.generate-chapter",
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: Date.now() - callStart,
        error: providerErr,
      });
      return err(502, "provider_failed", providerErr);
    }
  } else {
    body_text = stubChapter(inputs);
    model = "stub/no-api-key";
    tokensIn = userPrompt.length;
    tokensOut = body_text.length;
    provider = "stub";
  }

  // Successful call (provider or stub) — log usage. Fire-and-forget;
  // a usage-log failure should never block delivering the chapter to
  // the member.
  void logUsage(svc, {
    provider,
    model,
    task: "eidos.chapter1",
    calledFrom: "member.api.map.generate-chapter",
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - callStart,
  });

  // ---- 6) Persist to eidos_chapters ----
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
  if (insertErr) return err(500, "chapter_persist_failed", insertErr.message);

  return NextResponse.json({
    ok: true,
    chapterNumber,
    language,
    body: body_text,
    model,
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
