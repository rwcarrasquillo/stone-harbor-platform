/**
 * embed — turn a string into a vector via OpenAI.
 *
 * Uses text-embedding-3-small (1536 dimensions). This model is the
 * current best price/quality ratio for English-language retrieval
 * and is what the schema's vector column is sized for. Changing
 * models means re-embedding the entire corpus AND adjusting the
 * vector(N) column type — non-trivial. Stay on this model until a
 * deliberate migration.
 *
 * Cost reference: ~$0.02 per 1M tokens. A 400-token chunk is about
 * 1/12,500th of a cent. The whole Phase A corpus (a few hundred
 * chunks) costs pennies to embed.
 */

import { EMBEDDING_MODEL } from "./types";

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[knowledge.embed] OPENAI_API_KEY missing. Set it in .env.local.",
    );
  }
  if (!text || !text.trim()) {
    throw new Error("[knowledge.embed] empty text");
  }

  // OpenAI's input limit for embeddings is 8191 tokens; we send raw
  // text and trust the user to chunk responsibly (the manifest does
  // paragraph-level chunks ~400 tokens each, well under the cap).
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `[knowledge.embed] OpenAI ${resp.status}: ${body.slice(0, 300)}`,
    );
  }
  const json = await resp.json();
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw new Error("[knowledge.embed] malformed OpenAI response");
  }
  return vec as number[];
}

/**
 * Batch helper. Embeds multiple strings in a single call (OpenAI
 * supports up to 2048 strings per request). Returns vectors in the
 * same order as the input.
 *
 * Used by the ingestion script when embedding a manifest of dozens
 * to hundreds of chunks at once.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[knowledge.embedBatch] OPENAI_API_KEY missing. Set it in .env.local.",
    );
  }

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(
      `[knowledge.embedBatch] OpenAI ${resp.status}: ${body.slice(0, 300)}`,
    );
  }
  const json = await resp.json();
  if (!Array.isArray(json?.data)) {
    throw new Error("[knowledge.embedBatch] malformed OpenAI response");
  }
  // Sort by `index` because OpenAI guarantees the order but it's
  // safer to be explicit and not rely on the implementation detail.
  const sorted = [...json.data].sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index,
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}
