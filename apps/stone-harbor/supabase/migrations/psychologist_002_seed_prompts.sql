-- psychologist_002_seed_prompts.sql
-- ============================================================================
-- SH-87 — Psychologist agent prompt templates.
--
-- DRAFT — NOT YET APPLIED. Apply after psychologist_001_schema.sql.
--
-- Seeds two prompt_templates rows the psychologist edge function renders:
--   - psychologist.system  — the agent's standing instructions. PLACEHOLDER
--     below: paste the founder-finalized §1 prompt from
--     Stone_Harbor_Psychologist_Agent.md after the clinical pass, then apply
--     the five data-accuracy redlines listed in the row's description.
--   - psychologist.user    — the per-run data harness (this is final; the edge
--     function fills the {{...}} vars each run).
--
-- Both are editable in the admin Prompts page without redeploying the function.
-- temperature is intentionally NULL: the agent runs on Opus 4.8, which rejects
-- temperature/top_p (the edge function never sends them).
-- ============================================================================

-- Row 1 — psychologist.system (PLACEHOLDER; user_prompt_template stays null here).
insert into public.prompt_templates
  (slug, label, category, description, system_prompt, user_prompt_template,
   temperature, max_tokens, active_version, is_active)
values (
  'psychologist.system',
  'Psychologist — System (DRAFT, pending clinical review)',
  'psychologist',
  'PLACEHOLDER. Paste the finalized §1 system prompt from Stone_Harbor_Psychologist_Agent.md here (admin Prompts page), then apply these five data-accuracy redlines before enabling: (1) score dimensions are witnessing_register, grounding, competitive_bar, therapeutic_depth, and prose_quality(EN)/native_cadence(ES) — overall_score is the weighted composite, not a 6th dimension; (2) a blog_failed_drafts row is one failing Critic pass incl. attempt 0 of rescued+shipped letters — revision pressure, not rejected letters; the table is young, treat sparse data as low-signal; (3) citations are machine-validated against the allowlist host after you return — unvalidated ones are dropped and the proposal may be downgraded; (4) agent_run_id is provided in the run context — echo it back, do not generate one; (5) "publish rate" is derived from is_published per angle (current state, not a decision log) — corroborate before any retirement.',
  $SYS$You are the Psychologist agent for Stone Harbor. (DRAFT PLACEHOLDER — the founder-reviewed system prompt from Stone_Harbor_Psychologist_Agent.md §1 has not been pasted in yet. Do not run against this placeholder.) Until replaced, return: {"agent_run_id":"<echo run_id>","summary":"system prompt not configured","proposals":[]}$SYS$,
  null,
  null, 16000, 1, true
)
on conflict (slug) do nothing;

-- Row 2 — psychologist.user (FINAL harness; system_prompt stays null here).
insert into public.prompt_templates
  (slug, label, category, description, system_prompt, user_prompt_template,
   temperature, max_tokens, active_version, is_active)
values (
  'psychologist.user',
  'Psychologist — User (per-run data harness)',
  'psychologist',
  'Per-run data harness. The psychologist edge function renders {{run_id}}, {{run_date}}, {{triggered_by}}, {{last_run_at}}, {{canon}}, {{score_patterns}}, {{library_means}}, {{failed_drafts}}, {{sample_letters}}, {{publish_signal}}, {{voice_never_list}}, {{source_allowlist}} before each call.',
  null,
  $USR$CANON REVIEW — {{run_date}}
Run id: {{run_id}} · Triggered: {{triggered_by}} · Last run: {{last_run_at}}

Everything below is the data for THIS run. Propose against it per your standing
instructions. Fetch nothing outside the allowlist in section 7.

=== 1. CURRENT CANON (24 angles) ===
Each: id · pillar · is_active · age_days · angle_name · harbor_framing ·
therapeutic_substrate[EN] · therapeutic_substrate_es[ES] ·
embodiment_instruction[EN] · embodiment_instruction_es[ES]
{{canon}}

=== 2. SCORE PATTERNS ===
Per (angle, language): mean + n + delta-from-library-mean for each dimension —
witnessing_register, grounding, competitive_bar, therapeutic_depth, and
prose_quality (EN) / native_cadence (ES). overall_score = weighted composite.
{{score_patterns}}
Library means: {{library_means}}

=== 3. CRITIC-PASS FAILURES (blog_failed_drafts) ===
A row here is one Critic pass that did not clear the gate — including attempt 0
of letters a later revision rescued and shipped. It is NOT a count of rejected
letters; read it as where the Writer needed revision pressure. This table is
young — treat sparse data as low-signal.
{{failed_drafts}}

=== 4. SAMPLE LETTER CONTENT (recent) ===
Title + opening (~400 chars) + closing line, for editorial spot-reading.
{{sample_letters}}

=== 5. PUBLISH SIGNAL (proxy) ===
Per angle: shipped (is_published=true) vs. drafted — current state, not a record
of your accept/reject decisions. Low ratio is weak signal; corroborate with
score patterns and sample reads before any retirement proposal.
{{publish_signal}}

=== 6. BINDING VOICE — §3 "NEVER DOES" (no proposal may violate this) ===
{{voice_never_list}}

=== 7. SOURCE ALLOWLIST (the ONLY hosts you may fetch) ===
{{source_allowlist}}

Produce your strict-JSON output now. Rank 3-8 proposals by impact.
Set "agent_run_id" to exactly "{{run_id}}".$USR$,
  null, 16000, 1, true
)
on conflict (slug) do nothing;
