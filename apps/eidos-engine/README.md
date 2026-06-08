# Eidos Engine

Standalone behavioral-inference service for Stone Harbor Ventures. Next.js 16
(App Router) on Vercel, backed by its own Supabase project. This is the
substrate for the five-perspectives behavioral-inference layer — the
push-event ingestion pipeline (§4) and the per-construct cron compute
infrastructure (§5) described in the architecture spec.

**Architecture spec:** `stone-harbor-docs/engineering/eidos/Eidos_Behavioral_Inference_Architecture.md`

> This is a service surface, not a member-facing site. Member-visible
> behavioral inferences render inside each host app (Stone Harbor's
> `/map → Rhythm`, etc.), not here.

---

## Why this is its own deployment

Decided in the architecture spec (§4 "Deploy target"):

- The inference code (circular means, entropy, NLP) is non-trivial TypeScript
  shared across the cron jobs, the admin spot-check view, and eventual
  member-facing surfaces. Vercel-hosted Next.js cron routes can `import` from
  the same `lib/` as everything else; Supabase Edge Functions (Deno) cannot
  without duplicating the math.
- Vendor independence — the engine isn't locked to Supabase the way Edge
  Functions would be.
- Multi-product alignment — one HTTP surface serves Stone Harbor, The Long
  Light, and future partners.

---

## Deploy contract

| Item | Value |
|---|---|
| Framework | Next.js 16, App Router, TypeScript strict |
| Production domain | `https://eidos.stoneharbor.app` (interim) |
| Healthcheck | `GET /api/health` → `200 { "status": "ok", "version": "<pkg.version>" }` |
| Vercel root directory | `apps/eidos-engine` |
| DNS | Cloudflare (same path as `admin.stoneharbor.app`) |

### Environment variables

All un-prefixed (server-only); none reach the browser. See `.env.example`.

| Var | Scope | Notes |
|---|---|---|
| `SUPABASE_URL` | all | `https://xfsqytpitltfeacvmvqm.supabase.co` |
| `SUPABASE_ANON_KEY` | all | Eidos project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **production only** | Never set in preview. Same Settings → API page. |
| `EIDOS_CRON_SECRET` | production + development | 32+ random chars. Authenticates Vercel cron invocations of future construct-compute jobs. |

---

## Supabase project

This app talks to the **standalone Eidos engine DB**, Supabase project
`xfsqytpitltfeacvmvqm` (name `eidos-engine`). This is **separate from Stone
Harbor's** application database (`fbqcmtcvgijlemfpncay`).

The behavioral-inference substrate migration (`eidos_behavioral_001.sql`) has
already been applied to this project — six tables (`eidos_consumers`,
`eidos_consumer_tokens`, `eidos_event_stream`, `eidos_construct_settings`,
`eidos_construct_feedback`, `eidos_ingest_log`), with `stone_harbor` and
`the_long_light` seeded as consumers. All tables have RLS enabled with
service-role-only access — all reads/writes flow through `lib/supabase/server.ts`,
which enforces consumer + member identity checks at the API layer.

---

## Host integration

Hosts push behavioral events to Eidos via an authenticated endpoint:

```
POST /api/v1/events
Authorization: Bearer <consumer_token>
Body: { events: [EidosEvent, ...] }
```

**That endpoint is built in EID-19, not here.** EID-17 (this issue) only
provisions the deployment. The consumer bearer token is minted separately and
added to host env vars by hand when EID-19 lands.

---

## Local development

```bash
cp .env.example .env.local   # fill in keys from the Eidos Supabase dashboard
pnpm install                 # from the monorepo root
pnpm --filter @stone-harbor/eidos-engine dev
```

`pnpm --filter @stone-harbor/eidos-engine build` / `typecheck` run the same
checks CI and Vercel run.

---

## Layout

```
app/
  layout.tsx              root layout (no-index; service surface)
  page.tsx                minimal 200 root
  api/health/route.ts     deploy-contract healthcheck
lib/
  supabase/server.ts      service-role client (cron, ingestion, admin)
  supabase/anon.ts        anon client stub (no public surface yet)
```

Construct-compute modules (e.g. `lib/circadian.ts`) will live here for now and
may be promoted to `packages/eidos` once reused across consumers. Instrument
scoring logic is imported from the `@stone-harbor/eidos` workspace package.
