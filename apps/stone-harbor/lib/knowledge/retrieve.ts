/**
 * retrieveChunks — semantic search over the knowledge corpus.
 *
 * Embeds the query, calls the retrieve_knowledge_chunks RPC, and
 * returns the top-K most similar chunks with source metadata.
 * Consumers pass these into prompts as grounding material.
 *
 * Calling convention:
 *   - Pass a Supabase client. The consumer chooses whether that's
 *     a service-role client (server) or a member-authenticated
 *     client (browser). Either works because the RPC is
 *     SECURITY DEFINER and the underlying tables grant SELECT to
 *     `authenticated` anyway.
 *   - The function is server-friendly: no DOM, no React, no
 *     side effects beyond a network round-trip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "./embed";
import type { RetrievedChunk, RetrieveOptions } from "./types";

export async function retrieveChunks(
  supabase: SupabaseClient,
  opts: RetrieveOptions,
): Promise<RetrievedChunk[]> {
  const { query, topK = 5, filterTags } = opts;
  if (!query?.trim()) return [];

  // 1) Turn the query into a 1536-dim vector.
  const queryEmbedding = await embed(query);

  // 2) Ask Postgres for the top-K most similar chunks.
  //    We send the vector as a JSON array literal — Supabase's
  //    JS client serializes it correctly for pgvector.
  const { data, error } = await supabase.rpc("retrieve_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_count: topK,
    filter_tags: filterTags ?? null,
  });

  if (error) {
    throw new Error(
      `[knowledge.retrieveChunks] RPC error: ${error.message}`,
    );
  }
  if (!Array.isArray(data)) return [];

  // 3) Normalize column names to camelCase for the rest of the app.
  return data.map((row: {
    chunk_id: string;
    source_id: string;
    source_title: string;
    source_authors: string[] | null;
    source_year: number | null;
    citation: string | null;
    chunk_text: string;
    similarity: number;
  }) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceAuthors: row.source_authors ?? [],
    sourceYear: row.source_year,
    citation: row.citation,
    chunkText: row.chunk_text,
    similarity: row.similarity,
  }));
}

/**
 * Convenience: format the retrieved chunks as the kind of grounding
 * block AI prompts typically expect. Returns an empty string when no
 * chunks come back — the consumer's prompt should treat empty
 * grounding as "use general knowledge with no citations."
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c, i) => {
      const authors = c.sourceAuthors.join(", ");
      const year = c.sourceYear ? ` (${c.sourceYear})` : "";
      const cite = c.citation ?? `${authors}${year}, ${c.sourceTitle}`;
      return `[${i + 1}] ${cite}\n${c.chunkText.trim()}`;
    })
    .join("\n\n");
}
