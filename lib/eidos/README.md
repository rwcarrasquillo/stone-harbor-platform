# Eidos — the engine inside Stone Harbor

Self-mapping engine grounded in validated personality, attachment, cognitive, emotional, behavioral, motivational, and clinical instruments. Currently lives inside the Stone Harbor repo. Designed to be extracted into a private package later, when a second consumer (a parallel platform, a coaching tool, a clinician-facing dashboard) needs it.

The strategic rationale lives in `Documents/Stone_Harbor_Project_Eidos_Roadmap_v1.docx`. Read it before contributing.

---

## The six rules — non-negotiable

These exist so the engine can be lifted out of Stone Harbor in roughly a day when the second consumer arrives. Break any of them and that day becomes a month.

1. **One folder, one prefix.** All Eidos code lives under `lib/eidos/`. All Eidos tables use the `eidos_` prefix. Never sprinkled into `app/`. Never mixed into Stone Harbor's domain tables.
2. **The boundary is one-way.** `app/` imports from `lib/eidos/`. `lib/eidos/` never imports from `app/`. If Eidos needs to know something about a Stone Harbor concept, the consumer passes it as a parameter.
3. **The API surface is deliberate.** Public functions live in `index.ts`. Anything not exported there is internal. The signatures are the contract the second consumer will rely on.
4. **Eidos consumes prompt templates, doesn't define them.** Chapter generators receive a template (managed by the admin app's `/prompts` editor) and produce structured prose. The voice of the consumer belongs to the consumer.
5. **Identity is the only crossed concept.** Eidos tables foreign-key to `auth.users(id)` — the shared auth identity. They never FK to `profiles`, `journal_entries`, or any Stone Harbor domain table.
6. **Versioned schema from day one.** Migrations are numbered `eidos_001_*.sql`, `eidos_002_*.sql`, etc. A future consumer runs them in order.

## Folder layout

```
lib/eidos/
├── README.md                       ← you are here
├── index.ts                        ← public API surface
├── types.ts                        ← shared types, no domain imports
├── instruments/                    ← each validated instrument is one file
│   ├── bfi10.ts                    ← Big Five short form (Rammstedt & John, 2007)
│   ├── schwartz.ts                 ← Schwartz Values short (2012)
│   ├── bpnsfs12.ts                 ← Self-determination needs (Chen et al., 2015)
│   └── phq2gad2.ts                 ← Baseline screening (Kroenke et al., 2003)
├── scoring/
│   ├── score-module.ts             ← dispatch responses → instrument scorer
│   └── aggregate-layers.ts         ← roll instrument scores into layer scores
├── chapters/
│   └── chapter1.ts                 ← Operating Manual Chapter 1 generator
├── safety/
│   └── evaluate.ts                 ← evaluateSafety(responses) → CrisisLevel
├── session/
│   └── state-machine.ts            ← week / module / pause-resume rules
└── __tests__/                      ← unit tests against the public API
```

## What's in Phase 1 (this milestone)

Three non-clinical instruments (BFI-10, Schwartz, BPNSFS-12) plus a brief baseline (PHQ-2 + GAD-2 with skip option). A pillar-recommendation function based on the three. Operating Manual Chapter 1 generator using Stone Harbor's `/prompts` infrastructure. Crisis-routing primitives for the baseline. The `/map/*` UI in the consumer.

## What's NOT in Phase 1

Clinical instruments (PHQ-9, GAD-7, ASRS-6, AUDIT-C, ACE-Q, Young Schemas, ECR-RS). Loop detection / pattern engine. Daily check-in. Brotherhood matching. Personalized roadmap content. These wait for a licensed clinical advisor to be on board and a privacy / terms update to land.

## Citations

Every instrument file carries the citation, the validated source, and the population norms in its header comment. When a clinician reviews the engine later, those citations are how they orient.
