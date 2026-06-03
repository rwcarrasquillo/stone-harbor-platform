/**
 * Knowledge — public API surface.
 *
 * Anything exported here is the contract consumers (Stone Harbor
 * today; potentially other products later) rely on.
 */

export type {
  KnowledgeSourceType,
  KnowledgeTag,
  RetrievedChunk,
  RetrieveOptions,
} from "./types";

export { EMBEDDING_DIM, EMBEDDING_MODEL } from "./types";

export { embed, embedBatch } from "./embed";
export { retrieveChunks, formatChunksForPrompt } from "./retrieve";
