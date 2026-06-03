#!/usr/bin/env node
/**
 * Stone Harbor — knowledge corpus ingestion.
 *
 * Reads data/knowledge/manifest.json, upserts each source into
 * knowledge_sources, embeds each chunk via OpenAI, and upserts into
 * knowledge_chunks.
 *
 * Idempotent on (source_id, chunk_index): re-running with the same
 * manifest does nothing. Adding new chunks appends. Changing an
 * existing chunk's text without bumping its chunk_index leaves the
 * old embedding in place — bump the chunk_index (or remove + re-add
 * the source) when meaningfully editing.
 *
 * Usage (from inside the VM):
 *   cd ~/Desktop/stone-harbor
 *   node scripts/ingest-knowledge.mjs
 *
 * Required env (read from .env.local automatically by next-env, or
 * pass via the shell):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - OPENAI_API_KEY
 *
 * Cost: ~$0.02 per 1M input tokens. The seed manifest is a few
 * thousand tokens; cents on the dollar.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------- env loading ----------
// Mirrors scripts/run-db-tests.mjs: read .env.local from the project
// root and populate process.env, so the script works the same way as
// `npm test` etc. without requiring the user to manually export vars.
async function loadEnvLocal() {
  try {
    const raw = await readFile(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // No .env.local — caller must export the three vars below.
  }
}
await loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[ingest-knowledge] Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.",
  );
  process.exit(1);
}
if (!OPENAI_KEY) {
  console.error(
    "[ingest-knowledge] Missing env: OPENAI_API_KEY required to embed chunks.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- helpers ----------

async function embedBatch(texts) {
  if (texts.length === 0) return [];
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI embed ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = await resp.json();
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function upsertSource(s) {
  // Try to find an existing row by (title, source_type) — that's the
  // table's unique constraint.
  const { data: existing } = await supabase
    .from("knowledge_sources")
    .select("id")
    .eq("title", s.title)
    .eq("source_type", s.source_type)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("knowledge_sources")
    .insert({
      title: s.title,
      authors: s.authors ?? [],
      year: s.year ?? null,
      source_type: s.source_type,
      citation: s.citation ?? null,
      url: s.url ?? null,
      license_notes: s.license_notes ?? null,
      tags: s.tags ?? [],
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`upsert source "${s.title}": ${error.message}`);
  }
  return data.id;
}

async function ingestSource(s) {
  const sourceId = await upsertSource(s);

  // Skip chunks already ingested for this source (idempotent re-runs).
  const { data: existing } = await supabase
    .from("knowledge_chunks")
    .select("chunk_index")
    .eq("source_id", sourceId);
  const have = new Set((existing ?? []).map((r) => r.chunk_index));

  const todo = (s.chunks ?? []).map((text, idx) => ({ idx, text }))
    .filter(({ idx }) => !have.has(idx));

  if (todo.length === 0) {
    console.log(`  ↳ ${s.title}: already ingested (${s.chunks?.length ?? 0} chunks)`);
    return { added: 0, total: s.chunks?.length ?? 0 };
  }

  console.log(`  ↳ ${s.title}: embedding ${todo.length} new chunk(s)…`);
  const vectors = await embedBatch(todo.map((t) => t.text));

  const rows = todo.map(({ idx, text }, i) => ({
    source_id: sourceId,
    chunk_index: idx,
    chunk_text: text,
    embedding: vectors[i],
    embedding_model: "text-embedding-3-small",
    tags: s.tags ?? [],
  }));

  const { error } = await supabase.from("knowledge_chunks").insert(rows);
  if (error) {
    throw new Error(`insert chunks for "${s.title}": ${error.message}`);
  }
  return { added: rows.length, total: s.chunks?.length ?? 0 };
}

// ---------- main ----------
async function main() {
  const manifestPath = resolve(ROOT, "data/knowledge/manifest.json");
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  const sources = manifest.sources ?? [];
  console.log(`[ingest-knowledge] manifest has ${sources.length} source(s)`);

  let added = 0;
  let total = 0;
  for (const s of sources) {
    const r = await ingestSource(s);
    added += r.added;
    total += r.total;
  }
  console.log(
    `[ingest-knowledge] done — ${added} new chunk(s) embedded, ${total} chunk(s) in manifest.`,
  );
}

main().catch((e) => {
  console.error("[ingest-knowledge] fatal:", e.message);
  process.exit(1);
});
