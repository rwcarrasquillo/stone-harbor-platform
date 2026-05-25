/**
 * Knowledge — shared types.
 *
 * Same boundary discipline as lib/eidos/: no imports from app/,
 * self-contained, exportable to a future second consumer.
 */

/** OpenAI text-embedding-3-small produces 1536-dim vectors. */
export const EMBEDDING_DIM = 1536;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export type KnowledgeSourceType =
  | "book"
  | "paper"
  | "article"
  | "talk"
  | "chapter"
  | "other";

/**
 * Tags are the team-curated topic taxonomy. Adding a tag means
 * editorial commitment to what it covers. Conservative additions:
 * don't tag liberally; tag for retrieval precision.
 */
export type KnowledgeTag =
  | "attachment"
  | "complex-ptsd"
  | "schemas"
  | "ifs"
  | "act"
  | "polyvagal"
  | "somatic"
  | "expressive-writing"
  | "stoic"
  | "mens-development"
  | "shame"
  | "divorce"
  | "betrayal"
  | "burnout"
  | "grief"
  | "boundaries"
  | "narrative-identity"
  | "values"
  | "motivation";

/**
 * The row shape returned by the retrieve_knowledge_chunks RPC. The
 * consumer typically receives a small array of these and passes the
 * chunk_text + source metadata into the AI prompt as grounding.
 */
export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceAuthors: string[];
  sourceYear: number | null;
  citation: string | null;
  chunkText: string;
  /** Cosine similarity in [-1, 1]; closer to 1 = better match. */
  similarity: number;
};

/**
 * Options for retrieveChunks(). The defaults are conservative:
 * top-5 matches across the entire corpus. Filter by tag(s) when the
 * call site knows what topic it cares about (e.g., daily quotes
 * filter by "stoic" + "expressive-writing").
 */
export type RetrieveOptions = {
  /** Plain-text query; will be embedded internally. */
  query: string;
  /** How many chunks to return. Default 5. RPC clamps to [1, 20]. */
  topK?: number;
  /**
   * If set, only return chunks whose own tags OR their source's tags
   * overlap with this list. Use sparingly — over-filtering can return
   * zero chunks for queries the corpus could otherwise serve.
   */
  filterTags?: KnowledgeTag[];
};
