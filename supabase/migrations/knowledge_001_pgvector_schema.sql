-- Stone Harbor — knowledge layer (Phase A).
--
-- A curated corpus of literature that grounds every AI call the
-- platform makes — Operating Manual chapters, blog drafts, daily
-- quotes, external-resource suggestions. The model stays a general
-- provider (Anthropic / OpenAI); what changes is that every response
-- is retrieval-augmented against peer-reviewed material the team
-- has explicitly vetted.
--
-- Two tables:
--   knowledge_sources  — one row per book / paper / article / talk
--   knowledge_chunks   — paragraph-level slices, embedded for retrieval
--
-- Storage: pgvector extension for cosine-similarity search.
-- Embedding model: text-embedding-3-small (OpenAI), 1536 dimensions.
-- (Changing models later means re-embedding everything — note in the
--  manifest if you do, so existing rows can be invalidated.)
--
-- RLS: knowledge_sources + knowledge_chunks are READ-ONLY for any
-- authenticated user (the corpus is not member-specific data, and
-- showing chunks back as citations doesn't leak anyone's PII).
-- Writes only via service-role (the admin app + the ingestion script).

create extension if not exists vector;

-- ============================================================
-- knowledge_sources
-- ============================================================
create table if not exists public.knowledge_sources (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  authors        text[] not null default '{}',
  year           smallint,
  source_type    text not null
                 check (source_type in ('book','paper','article','talk','chapter','other')),
  citation       text,
  url            text,
  license_notes  text,
  tags           text[] not null default '{}',
  added_at       timestamptz not null default now(),
  unique (title, source_type)
);

create index if not exists knowledge_sources_tags_idx
  on public.knowledge_sources using gin (tags);

-- ============================================================
-- knowledge_chunks
-- ============================================================
create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  source_id       uuid not null references public.knowledge_sources(id) on delete cascade,
  chunk_index     int  not null,
  chunk_text      text not null,
  embedding       vector(1536) not null,
  embedding_model text not null default 'text-embedding-3-small',
  tags            text[] not null default '{}',
  added_at        timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index if not exists knowledge_chunks_source_idx
  on public.knowledge_chunks(source_id);
create index if not exists knowledge_chunks_tags_idx
  on public.knowledge_chunks using gin (tags);

-- HNSW index on the embedding for fast approximate nearest neighbors.
-- Cosine distance is the standard for OpenAI embeddings; the lower
-- the distance, the closer the match.
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- RLS
-- ============================================================
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks  enable row level security;

-- Authenticated users can read the corpus. (Anon visitors cannot —
-- they have no reason to query embeddings against random research.)
create policy "knowledge_sources read for authenticated"
  on public.knowledge_sources for select
  to authenticated
  using (true);

create policy "knowledge_chunks read for authenticated"
  on public.knowledge_chunks for select
  to authenticated
  using (true);

-- No insert/update/delete policies for the authenticated role; writes
-- go through service-role only (the admin app + the ingestion script).

-- ============================================================
-- Retrieval RPC
-- ============================================================
-- A SECURITY DEFINER function that takes a query embedding and
-- returns the top-K most similar chunks with their source metadata.
-- The function is invoked from server-side code (the member app's
-- /api/map/generate-chapter and the admin app's edge functions);
-- the service-role client calls it. Could be tightened later to
-- restrict who can call it.
create or replace function public.retrieve_knowledge_chunks(
  query_embedding vector(1536),
  match_count     int default 5,
  filter_tags     text[] default null
)
returns table (
  chunk_id      uuid,
  source_id     uuid,
  source_title  text,
  source_authors text[],
  source_year   smallint,
  citation      text,
  chunk_text    text,
  similarity    float
)
language sql
stable
security definer
as $$
  select
    c.id            as chunk_id,
    s.id            as source_id,
    s.title         as source_title,
    s.authors       as source_authors,
    s.year          as source_year,
    s.citation      as citation,
    c.chunk_text    as chunk_text,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where filter_tags is null
     or c.tags && filter_tags
     or s.tags && filter_tags
  order by c.embedding <=> query_embedding
  limit greatest(1, least(20, match_count));
$$;

-- ============================================================
-- Done. Run a corpus ingestion next: scripts/ingest-knowledge.mjs
-- ============================================================
