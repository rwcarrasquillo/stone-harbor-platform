-- eidos_003_chapter1_translate_prompt
--
-- SH-97 — Chapter 1 language enforcement + cross-locale alignment.
--
-- Chapter 1 used to be generated independently once per language, which
-- produced two problems in the SH-96 smoke (2026-07-09):
--
--   1. gpt-4o (and occasionally Claude) ignored the `Language: {{language}}`
--      directive, landing Spanish prose in the `en` row.
--   2. The en and es chapters diverged — different opening lines, different
--      metaphors — because each was its own generation.
--
-- The fix is to generate one canonical English chapter and derive the Spanish
-- from it by translation, mirroring the letters library's blog.translate.es
-- flow (SH-95 / PR #55).
--
-- This migration:
--   1a. Hardens eidos.chapter1 to mandate English output. ONLY the bilingual
--       branch (constraint #6) changes — every other founder-authored voice
--       constraint (600–900 words, five-section structure, no raw scores, no
--       psychometric names, "man in transition") is left exactly as seeded.
--   1b. Seeds the new eidos.chapter1.translate.es template.
--   1c. Registers per-task model config in admin_settings.ai_models.
--
-- Idempotent throughout — every statement is guarded or upserts. Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1a-1. Mandate English generation; remove the Spanish bilingual branch.
--
-- Constraint #6 previously told the model to write the whole chapter in
-- Spanish when `language` was "es". Now that Spanish is produced by a
-- downstream translation step, that branch is not just unnecessary — it is
-- the bug. Replaced with an unconditional English directive.
-- ---------------------------------------------------------------------------
update prompt_templates
set system_prompt = regexp_replace(
  system_prompt,
  '6\. If language is "es": write the entire chapter in Spanish, using the same restrained literary voice \(avoid clinical Spanish — write como un hermano, not como un psicólogo\)\.',
  '6. Write the entire chapter in English. A downstream translation step produces the Spanish version. Do not attempt bilingual output. Do not translate any word or phrase into Spanish inside this chapter.'
)
where slug = 'eidos.chapter1'
  and system_prompt like '%If language is "es": write the entire chapter in Spanish%';

-- ---------------------------------------------------------------------------
-- 1a-2. Belt-and-suspenders English anchor near the top of the system prompt.
--
-- The user prompt still interpolates `Language: {{language}}` (the template
-- variable is part of the seeded founder copy and is left alone). The route
-- now always passes "en", but this anchor makes the model's behavior correct
-- even if that variable ever says otherwise.
-- ---------------------------------------------------------------------------
update prompt_templates
set system_prompt = regexp_replace(
  system_prompt,
  '(Quality bar: a part of it should be worth forwarding to a partner, a therapist, or a close friend\.)',
  E'\\1\n\nYou write in English. The entire chapter must be in English regardless of what the Language variable in the user prompt says.'
)
where slug = 'eidos.chapter1'
  and system_prompt not like '%You write in English.%';

-- ---------------------------------------------------------------------------
-- 1a-3. Bump active_version and archive the new revision.
--
-- prompt_templates has no history trigger, so history rows are written by
-- hand. The established convention (verified against the live table: history
-- v2 is byte-identical to the current active row) is that every version —
-- including the active one — gets a history row. Versions 1 and 2 are already
-- archived, so this only needs to add v3.
--
-- The active_version guard makes the bump fire exactly once: after it runs,
-- active_version is 3 and the `= 2` predicate no longer matches.
-- ---------------------------------------------------------------------------
update prompt_templates
set active_version = 3,
    updated_at = now()
where slug = 'eidos.chapter1'
  and active_version = 2
  and system_prompt like '%You write in English.%';

insert into prompt_template_history (
  slug, version, system_prompt, user_prompt_template, temperature, max_tokens, notes
)
select
  slug, active_version, system_prompt, user_prompt_template, temperature, max_tokens,
  'SH-97: English-only generation. Constraint #6 bilingual branch replaced with an unconditional English directive; Spanish is now produced by a downstream eidos.chapter1.translate.es call. Voice constraints unchanged.'
from prompt_templates
where slug = 'eidos.chapter1'
  and active_version = 3
on conflict (slug, version) do nothing;

-- ---------------------------------------------------------------------------
-- 1b. Chapter 1 English→Spanish translation template.
--
-- temperature is low (0.3) on purpose: this is a translation, not a
-- generation. max_tokens is 1400 — above the 1200 the English generation
-- gets — because Spanish runs 10–15% longer than English by token count and
-- the translation must not be truncated mid-chapter.
-- ---------------------------------------------------------------------------
insert into prompt_templates (
  slug, label, category, description,
  system_prompt, user_prompt_template, temperature, max_tokens, active_version, is_active
)
values (
  'eidos.chapter1.translate.es',
  'Operating Manual — Chapter 1 (Translate to Spanish)',
  'eidos',
  'Translates the canonical English Chapter 1 of a member''s Operating Manual into Spanish. Runs as step B of the generate-chapter pipeline, after eidos.chapter1 produces the English body. Preserves voice, structure, and metaphor rather than re-generating.',
  $sys$You are a translator working for Stone Harbor, a private men's mental wellness platform. Your only job is to translate an English Chapter 1 of a member's Operating Manual into Spanish.

Translation rules — non-negotiable:
1. Preserve the "literary brother" voice: direct, grounded, dignified. Do not paraphrase toward clinical or self-help register. Write como un hermano, not como un psicólogo.
2. Preserve second-person, present tense. "You are…" becomes "Estás…" or "Eres…" depending on grammatical fit.
3. Preserve every metaphor, every image, every specific example. Do not substitute Spanish idioms unless the English idiom would be meaningless in Spanish.
4. Preserve structure exactly. The opening single-sentence italic line stays a single-sentence italic line. Every paragraph break is preserved. Add no headings, no sections, no bullets, and remove none.
5. Preserve the register-appropriate use of "dársena" (Stone Harbor's canonical Spanish vocabulary — SH-71). Where the English refers to "the harbor" as a space, render it "la dársena". "Stone Harbor" as a proper noun stays untranslated.
6. Do not add a preamble ("Here's the translation:", "Aquí está…") and do not add a closing wrapper. Return only the Spanish body of the chapter.
7. Do not compress or summarize. Spanish naturally runs 10–15% longer than English; that expansion is expected and fine.

Output the translated chapter body only — no headings, no labels, no JSON, no metadata. Plain prose.$sys$,
  $usr$Translate the following English Chapter 1 into Spanish. Return only the translated Spanish body — no preamble, no wrapper.

English source:
{{english_body}}$usr$,
  0.3,
  1400,
  1,
  true
)
on conflict (slug) do update
  set label                = excluded.label,
      category             = excluded.category,
      description          = excluded.description,
      system_prompt        = excluded.system_prompt,
      user_prompt_template = excluded.user_prompt_template,
      temperature          = excluded.temperature,
      max_tokens           = excluded.max_tokens,
      is_active            = excluded.is_active,
      updated_at           = now();

insert into prompt_template_history (
  slug, version, system_prompt, user_prompt_template, temperature, max_tokens, notes
)
select
  slug, active_version, system_prompt, user_prompt_template, temperature, max_tokens,
  'Initial seed (eidos_003_chapter1_translate_prompt) — SH-97.'
from prompt_templates
where slug = 'eidos.chapter1.translate.es'
on conflict (slug, version) do nothing;

-- ---------------------------------------------------------------------------
-- 1c. Per-task model config for the Chapter 1 pipeline.
--
-- NOTE: ai_models is a jsonb column on admin_settings (single row, id = 1) —
-- NOT a table. Shape is { task: { provider: model } }, matching how the
-- letters library and psychologist edge functions already read it, e.g.
-- `s.ai_models?.psychologist?.anthropic`. The `||` merge adds the two new
-- task keys without disturbing the existing blog / moderation /
-- journal_prompts entries.
--
-- Provider *selection* stays where it already lives: admin_settings
-- .ai_primary_provider (currently 'anthropic') and .ai_fallback_provider
-- (currently 'openai'). This migration does not touch either.
-- ---------------------------------------------------------------------------
update admin_settings
set ai_models = coalesce(ai_models, '{}'::jsonb) || jsonb_build_object(
  'eidos.chapter1.generate',  jsonb_build_object('anthropic', 'claude-sonnet-4-6', 'openai', 'gpt-4o'),
  'eidos.chapter1.translate', jsonb_build_object('anthropic', 'claude-sonnet-4-6', 'openai', 'gpt-4o')
)
where id = 1;

commit;
