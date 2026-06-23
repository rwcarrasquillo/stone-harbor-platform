-- ============================================================================
-- blog_001_draft_scores.sql
--
-- Stone Harbor — SH-78 Cron AI Quality Gate (Phase 1: scorer + persistence).
--
-- Creates:
--   1. blog_draft_scores — one row per (post_id, language) translation.
--      Holds the quality score, hard-rule pass/fail, per-dimension breakdown,
--      LLM-provided reasoning, scorer model + provider, and timestamp.
--      Composite PK matches blog_post_translations so a single translation
--      can never have two scores in flight.
--
--   2. admin_settings.blog_quality_gate_enabled column — default false. When
--      flipped true, generate-blog-posts (in a later phase ticket) consults
--      the score before landing a new draft.
--
--   3. Two prompt template rows in prompt_templates: blog.score.en +
--      blog.score.es. The scorer reads these so the rubric can be tuned in
--      the admin Prompts page without redeploying the edge function.
--
-- Why translations not parent: the score is a property of THIS translation's
-- prose, not the bilingual letter as a whole. An EN version can be excellent
-- and the ES version off-register; both deserve independent scoring.
--
-- Why this table doesn't FK to blog_post_translations: it does in spirit
-- (post_id + language matches the composite key there), but adding the FK
-- would require us to delete scores when a translation is deleted, which
-- we may not want — keeping orphaned scores around helps us understand
-- post-mortem why a draft was rejected even after the draft itself was
-- removed. If we later decide that's not worth the lint, add the FK.
-- ============================================================================

-- Score table — one row per scored translation
CREATE TABLE IF NOT EXISTS public.blog_draft_scores (
  post_id uuid NOT NULL,
  language text NOT NULL CHECK (language IN ('en', 'es')),
  overall_score numeric(4, 2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 10),
  hard_rules_passed boolean NOT NULL,
  hard_rules jsonb NOT NULL,        -- per-rule pass/fail + LLM reasoning
  scales jsonb NOT NULL,             -- per-dimension 1-10 + LLM reasoning
  summary text,                      -- LLM's short editorial verdict
  threshold_at_scoring numeric(4, 2),-- whatever threshold was live at scoring time, for audit
  passed_threshold boolean,          -- overall_score >= threshold_at_scoring
  scorer_provider text NOT NULL,     -- 'anthropic' or 'openai'
  scorer_model text NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, language)
);

-- Indices for the two most common queries:
--   1. "Show me the score for this draft" — covered by PK
--   2. "What's the distribution of scores across the published library?"
CREATE INDEX IF NOT EXISTS idx_blog_draft_scores_score
  ON public.blog_draft_scores (overall_score);
CREATE INDEX IF NOT EXISTS idx_blog_draft_scores_passed
  ON public.blog_draft_scores (passed_threshold, scored_at DESC);

-- RLS — admin-only. Service role bypasses RLS for the edge function;
-- admin client uses authenticated session matched to admin_accounts.
ALTER TABLE public.blog_draft_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blog_draft_scores: admins read"
  ON public.blog_draft_scores
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_accounts a
      WHERE a.user_id = auth.uid()
    )
  );

CREATE POLICY "blog_draft_scores: admins write"
  ON public.blog_draft_scores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_accounts a
      WHERE a.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.blog_draft_scores IS
  'SH-78 quality gate. One row per (post_id, language) translation. Persists the LLM-judged voice rubric score so generate-blog-posts can decide land-vs-reject and admin can surface the score on draft cards.';

-- ============================================================================
-- Admin settings — feature toggle
-- ============================================================================
-- Default false so the gate has no effect until calibration is complete and
-- the founder turns it on. Once on, generate-blog-posts (in a follow-up
-- ticket) consults the score and either lands or rejects.

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS blog_quality_gate_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS blog_quality_gate_threshold numeric(4, 2) NOT NULL DEFAULT 7.0;

COMMENT ON COLUMN public.admin_settings.blog_quality_gate_enabled IS
  'When true, generate-blog-posts checks blog_draft_scores.overall_score against blog_quality_gate_threshold before landing. Drafts below threshold land as is_published=false but flagged for review (still visible in admin Posts page, just sorted/badged).';

COMMENT ON COLUMN public.admin_settings.blog_quality_gate_threshold IS
  'Drafts scoring at or above this value are kept; below this value are flagged as "below-threshold." Calibrated from distribution of published-letter scores (target: ~10th percentile).';

-- ============================================================================
-- Prompt templates — blog.score.en + blog.score.es
-- ============================================================================
-- The scoring prompt lives in prompt_templates so the founder can tune the
-- rubric in the admin Prompts page without a redeploy. Two language-specific
-- variants because the rubric for ES includes additional dimensions (native
-- cadence vs translated-English-rhythm, zero `usted`).
--
-- The system prompt establishes Stone Harbor's harbor-voice criteria.
-- The user prompt template takes {{pillar}} and {{content}} variables.
--
-- Output contract is STRICT JSON — the scorer parses it directly. Any
-- non-JSON wrapping (markdown fences, prose preamble) breaks parsing.

INSERT INTO public.prompt_templates (
  slug,
  label,
  category,
  description,
  system_prompt,
  user_prompt_template,
  temperature,
  max_tokens,
  active_version,
  is_active
)
VALUES (
  'blog.score.en',
  'Blog — Quality scorer (English)',
  'blog',
  'SH-78 quality gate scorer for English Stone Harbor letters. Output strict JSON per the rubric.',
  $sys$You are the editorial voice of Stone Harbor — a recovery platform for men in psychological transition. Your job is to score a generated blog letter against the Harbor Voice rubric and output strict JSON.

The Harbor Voice posture (memorize):
- Holds without judging. Reflects without instructing.
- Recognizes (remembers what the member wrote) before greeting.
- Notices rather than measures. ("Your mornings have been later than they used to be," not "Your sleep score is 78.")
- Asks more than it claims. "What does that look like now?" is the favorite sentence.
- Walks alongside. Same pace, same path.
- Holds silence when there's nothing to say.
- Never counts streaks, quantifies selfhood, performs urgency, diagnoses, or reminds the member of being broken.

The five diagnostic questions (apply to every letter):
1. Does this hold, or does it push?
2. Does this reflect, or does it instruct?
3. Does this remember, or does it announce?
4. Does this walk alongside, or does it pull?
5. Does this earn the quiet — or does it fill it?

The competitive bar: the letter must read better than what a competent therapist would produce. Not just voice-aligned — best-in-category. Beat Calm/Headspace generic CBT register, beat Reflectly/Stoic surface-level affirmation, beat AI-recovery-blog clichés.

RUBRIC

Hard rules (each binary, all must pass for the score to count for production):
- word_count_ok: body word count in [600, 1200] range
- forbidden_phrases_ok: zero AI-tell phrases ("As an AI", "I cannot", "It's important to note that", "It's crucial to remember", "Studies show", "Research shows")
- pillar_coherence_ok: content actually develops the named pillar (not just mentions it once and pivots)

Quality dimensions (each 1-10):
- witnessing_register: holds/reflects (10) vs pushes/instructs (1). Per Q1+Q2 of the diagnostic.
- recognition_warmth: notices/remembers (10) vs announces/declares (1). Per Q3.
- grounding: concrete sensory anchors (10) vs abstract counsel (1). The body needs something to feel/see/hold.
- prose_quality: literary cadence, varied sentence length, earned metaphors (10) vs AI-rhythmic/list-like (1).
- competitive_bar: best-in-category vs competent therapist/recovery writer (10) vs generic AI-blog output (1).

Output STRICT JSON. No markdown fences. No prose preamble. Just the JSON object below.

{
  "hard_rules": {
    "word_count_ok": true|false,
    "word_count": <int>,
    "forbidden_phrases_ok": true|false,
    "forbidden_phrases_found": [<string>...],
    "pillar_coherence_ok": true|false,
    "pillar_coherence_reasoning": "<one sentence>"
  },
  "scales": {
    "witnessing_register": <1-10>,
    "witnessing_register_reasoning": "<one sentence with a concrete quote from the letter>",
    "recognition_warmth": <1-10>,
    "recognition_warmth_reasoning": "<one sentence with a concrete quote>",
    "grounding": <1-10>,
    "grounding_reasoning": "<one sentence with a concrete quote>",
    "prose_quality": <1-10>,
    "prose_quality_reasoning": "<one sentence>",
    "competitive_bar": <1-10>,
    "competitive_bar_reasoning": "<one sentence naming what category this beats or fails>"
  },
  "summary": "<2-3 sentences: what the letter does well and the single biggest weakness if any>"
}

Weighted overall score (computed by the caller, not by you) = (witnessing_register × 1.5 + recognition_warmth × 1.0 + grounding × 1.2 + prose_quality × 1.0 + competitive_bar × 1.3) / 6.0.

Score honestly. The library has 38 published English letters; a passing letter beats most of them, not just the floor. Don't grade-inflate to be polite.$sys$,
  $user$Pillar: {{pillar}}

Letter to score:

{{content}}

Output the JSON scoring object now. No prose preamble. No markdown fences. Strict JSON only.$user$,
  0.3,
  2000,
  1,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  active_version = EXCLUDED.active_version,
  is_active = EXCLUDED.is_active;

INSERT INTO public.prompt_templates (
  slug,
  label,
  category,
  description,
  system_prompt,
  user_prompt_template,
  temperature,
  max_tokens,
  active_version,
  is_active
)
VALUES (
  'blog.score.es',
  'Blog — Quality scorer (Español)',
  'blog',
  'SH-78 quality gate scorer for Spanish Stone Harbor letters. Output strict JSON per the rubric. Adds native_cadence dimension + usted hard rule on top of the English rubric.',
  $sys$Eres la voz editorial de Stone Harbor — una plataforma de recuperación para hombres en transición psicológica. Tu trabajo es calificar una carta generada contra la rúbrica de Harbor Voice y devolver JSON estricto.

La postura de Harbor Voice (memoriza):
- Sostiene sin juzgar. Refleja sin instruir.
- Reconoce (recuerda lo que el miembro escribió) antes de saludar.
- Nota más que mide. ("Tus mañanas han sido más tarde de lo normal," no "Tu puntaje de sueño es 78.")
- Pregunta más de lo que afirma. "¿Cómo se ve eso ahora?" es la oración favorita.
- Camina al lado. Mismo paso, mismo sendero.
- Sostiene el silencio cuando no hay nada que decir.
- Nunca cuenta rachas, cuantifica la identidad, performa urgencia, diagnostica, ni recuerda al miembro que está roto.

Las cinco preguntas diagnósticas (aplican a cada carta):
1. ¿Esto sostiene, o empuja?
2. ¿Esto refleja, o instruye?
3. ¿Esto recuerda, o anuncia?
4. ¿Esto camina al lado, o jala?
5. ¿Esto se gana el silencio — o lo llena?

El listón competitivo: la carta debe leerse mejor que lo que un terapeuta competente produciría. No solo alineada con la voz — la mejor de su categoría.

Vocabulario obligatorio del refugio: `tú` (jamás `usted`), `dársena` (no `puerto`), `refugio`, `sendero`. Em-dashes en lugar de paréntesis donde sea posible.

RÚBRICA

Reglas duras (cada una binaria, todas deben pasar):
- word_count_ok: cuerpo entre [600, 1200] palabras
- forbidden_phrases_ok: cero frases-AI ("Como una IA", "No puedo", "Es importante notar que", "Los estudios muestran")
- usted_ok: CERO instancias de `usted` (formal) — la voz es íntimamente `tú`
- pillar_coherence_ok: el contenido realmente desarrolla el pilar nombrado

Dimensiones de calidad (cada una 1-10):
- witnessing_register: sostiene/refleja (10) vs empuja/instruye (1). Por Q1+Q2 del diagnóstico.
- recognition_warmth: nota/recuerda (10) vs anuncia/declara (1). Por Q3.
- grounding: anclajes sensoriales concretos (10) vs consejo abstracto (1).
- native_cadence: ritmo literario español nativo (10) vs ritmo-inglés-traducido (1). Calcos como "literalmente," frases que se sienten construidas en inglés primero, rebajan el puntaje.
- competitive_bar: mejor-de-categoría vs terapeuta competente (10) vs blog-AI-genérico (1).

Devuelve JSON ESTRICTO. Sin cercas de markdown. Sin preámbulo en prosa. Solo el objeto JSON abajo.

{
  "hard_rules": {
    "word_count_ok": true|false,
    "word_count": <int>,
    "forbidden_phrases_ok": true|false,
    "forbidden_phrases_found": [<string>...],
    "usted_ok": true|false,
    "usted_count": <int>,
    "pillar_coherence_ok": true|false,
    "pillar_coherence_reasoning": "<una oración>"
  },
  "scales": {
    "witnessing_register": <1-10>,
    "witnessing_register_reasoning": "<una oración con una cita concreta de la carta>",
    "recognition_warmth": <1-10>,
    "recognition_warmth_reasoning": "<una oración con cita>",
    "grounding": <1-10>,
    "grounding_reasoning": "<una oración con cita>",
    "native_cadence": <1-10>,
    "native_cadence_reasoning": "<una oración nombrando si el ritmo es nativo o calcado del inglés>",
    "competitive_bar": <1-10>,
    "competitive_bar_reasoning": "<una oración>"
  },
  "summary": "<2-3 oraciones: lo que la carta hace bien y la mayor debilidad si la hay>"
}

Puntaje ponderado (computado por el llamador): (witnessing_register × 1.5 + recognition_warmth × 1.0 + grounding × 1.2 + native_cadence × 1.0 + competitive_bar × 1.3) / 6.0.

Califica honestamente. No infles puntajes por cortesía.$sys$,
  $user$Pilar: {{pillar}}

Carta a calificar:

{{content}}

Devuelve el objeto JSON de calificación ahora. Sin preámbulo. Sin cercas de markdown. JSON estricto.$user$,
  0.3,
  2000,
  1,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  temperature = EXCLUDED.temperature,
  max_tokens = EXCLUDED.max_tokens,
  active_version = EXCLUDED.active_version,
  is_active = EXCLUDED.is_active;
