# Knowledge — Stone Harbor's RAG layer

Curated corpus of literature that grounds every AI call the platform makes — Operating Manual chapters, blog drafts, daily quotes, external-resource suggestions. The model stays a general provider (Anthropic / OpenAI); what changes is that every response is retrieval-augmented against peer-reviewed material the team has vetted.

## The split

- `lib/eidos/` — measurement engine (instruments, scoring, layer aggregation, chapter inputs).
- `lib/knowledge/` — retrieval-augmented generation. This folder.
- The two are independent. Eidos produces structured signals; knowledge produces grounded text. The chapter generator combines them.

## Public API

```ts
import { embed, retrieveChunks } from "@/lib/knowledge";

// Embed a query string against OpenAI's text-embedding-3-small.
const embedding = await embed("attachment anxiety after divorce");

// Retrieve top-K most similar chunks from the corpus.
const chunks = await retrieveChunks(supabase, {
  query: "attachment anxiety after divorce",
  topK: 5,
  filterTags: ["attachment", "divorce"], // optional
});
```

## Boundary discipline

Same rules as `lib/eidos/`:

1. All knowledge code lives under `lib/knowledge/`. Tables prefixed `knowledge_`.
2. The boundary is one-way. `app/` imports from `lib/knowledge/`. `lib/knowledge/` never imports from `app/`.
3. The public API surface lives in `index.ts`. Internals are refactor-free.
4. Versioned schema (`knowledge_001_*.sql`, then `_002_*`, etc.) so a future consumer can adopt the corpus standalone.

## Environment variables

- `OPENAI_API_KEY` — required for `embed()`. Calls `https://api.openai.com/v1/embeddings` with `text-embedding-3-small`.
- `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` — required for retrieval (calls the `retrieve_knowledge_chunks` RPC).

## Corpus ingestion

`scripts/ingest-knowledge.mjs` reads `data/knowledge/manifest.yaml`, embeds each chunk, and upserts to `knowledge_chunks`. Idempotent on `(source_id, chunk_index)`. Re-running on the same manifest is a no-op; adding new chunks appends.
