-- letters_002_translate_prompt_template.sql
-- Seeds the prompt template the translate-blog-post edge function uses
-- to render English letters into Spanish counterparts in the harbor's
-- voice. The template is in Spanish so the model defaults to Spanish
-- output. {{title}}, {{summary}}, {{content}}, {{pillar}} are rendered
-- by the edge function before the LLM call.

insert into public.prompt_templates
  (slug, label, category, description, user_prompt_template,
   temperature, max_tokens, active_version, is_active)
values (
  'blog.translate.es',
  'Blog — Translate to Spanish',
  'blog',
  'Renders an English letter into a Spanish counterpart in the harbor voice. Used by the translate-blog-post edge function to backfill missing ES translations for existing EN-only letters. Native Spanish prose (not literal translation), preserves the core insight and structural shape.',
$$Tienes una carta original en inglés escrita para hombres atravesando recuperación psicológica, etapa {{pillar}}. Tu trabajo es escribir su contraparte en español — no una traducción literal, sino una versión nativa que conserve la columna emocional de la carta original mientras se lee como prosa española nativa, en la voz de la dársena de Stone Harbor.

La carta original:

TÍTULO: {{title}}
RESUMEN: {{summary}}
CUERPO:
{{content}}

Tu tarea: escribir esta carta de nuevo en español, en aproximadamente 700-1000 palabras, conservando los puntos clave (gancho de apertura, secciones temáticas, ejercicio práctico si lo hay, línea de cierre) pero traduciéndola al ritmo y vocabulario de la dársena.

Guía de voz para tu versión española:
- Dirígete al lector como "tú" — nunca "usted".
- Usa el vocabulario establecido de Stone Harbor cuando sea natural: "la dársena" (no "el puerto"), "refugio", "sendero", "tu camino". No fuerces el uso.
- Calma, arraigo, masculino, directo. Sin clichés de autoayuda.
- Sin encabezados markdown. Sin listas con viñetas.
- 3 o 4 secciones distintas de prosa fluida.
- Cada sección termina con una transición a la siguiente.
- Cierra con una sola oración que aterriza y permanece.
- Fundamenta en conceptos terapéuticos concretos (IFS, ACT, práctica somática, disciplina estoica) cuando aparezcan en el original. Mantén los términos en su forma estándar en español: "Sistemas Internos de Familia (IFS)", "práctica somática", "disciplina estoica", "reformulación cognitiva".
- Evita: encuadre religioso (salvo que esté en el original), tropos de "guerrero" o "batalla", lugares comunes genéricos, emojis, hashtags.
- Em-dashes (—) en lugar de guiones dobles.

Devuelve exactamente este formato y nada más. Los marcadores Title: y Summary: deben permanecer en inglés (los lee un parser); el contenido va en español:

Title: <título en español, 4 a 9 palabras, sin comillas>
Summary: <una oración en español, 12 a 20 palabras, sin comillas>

<el cuerpo en español, 700-1000 palabras, solo prosa plana>$$,
  0.85, 2500, 1, true
)
on conflict (slug) do nothing;
