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

## Host integration — `POST /api/v1/events`

Every host platform integrates with Eidos by pushing events to this single
authenticated endpoint. The same shape serves Stone Harbor today, The Long
Light next, and any future partner.

### Request

```
POST /api/v1/events
Authorization: Bearer <consumer_token>
Content-Type: application/json

{
  "events": [
    {
      "event_id": "evt_a1b2c3",
      "user_id": "<host's opaque user id>",
      "type": "journal.created",
      "timestamp": "2026-06-08T22:00:00Z",
      "payload": { "mood": "grounded", "length": 412 }
    }
  ]
}
```

### Fields

| Field | Rules |
|---|---|
| `event_id` | Host-provided unique id. Used for idempotency — re-pushing the same id is safe. Non-empty string ≤128 chars. |
| `user_id` | Host's opaque user id. Eidos doesn't decode it. Non-empty string ≤128 chars. |
| `type` | Lowercase dotted namespace, e.g. `journal.created`, `mood.selected`, `message.sent`. Must match `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$`. ≤64 chars. |
| `timestamp` | ISO 8601, UTC or with offset. |
| `payload` | Arbitrary JSON object. Optional (defaults to `{}`). Cannot be an array or primitive. |

Batch limit: **1000 events per request**.

### Authentication

`Authorization: Bearer <token>` where the token is a consumer-scoped secret
issued by Eidos. The token is hashed with SHA-256 and compared against
`eidos_consumer_tokens.token_hash`. Plaintext tokens are never persisted
server-side after minting. Each token has a `scopes` array — this endpoint
requires `events:write`.

### Response

**200** — success (including partial dedup):

```json
{ "accepted": 7, "deduped": 1 }
```

`accepted + deduped` always equals the number of events in the request.

**401** — `{ "error": "unauthorized", "reason": "missing_token" | "malformed_header" | "unknown_token" }`

**403** — `{ "error": "unauthorized", "reason": "revoked" | "expired" | "insufficient_scope" | "consumer_inactive" }`

**400** — `{ "error": "invalid_json" }` or `{ "error": "validation_failed", "detail": "<reason>" }`

**413** — batch exceeds 1000 events.

**500** — `{ "error": "db_error" }`. Retry the request.

### Idempotency

Deduplication is by `(consumer_id, event_id)`. The same host can safely retry
an event with the same `event_id` — the second attempt counts in `deduped`, not
`accepted`. This is what makes the push-event pattern resilient to network
failures and host crashes.

### Observability

Every request — success or failure — is logged to `eidos_ingest_log` with the
consumer id, token prefix, HTTP status, event counts, and any error message.
This is the forensic trail for debugging integration issues with hosts.

### Quick integration test

```bash
TOKEN=<paste your consumer token>
curl -i -X POST https://eidos.stoneharbor.app/api/v1/events \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "event_id": "smoke_test_1",
      "user_id": "founder",
      "type": "smoke.test",
      "timestamp": "2026-06-08T22:00:00Z",
      "payload": { "note": "integration verify" }
    }]
  }'
```

Expect `200 {"accepted":1,"deduped":0}` on first call, `200 {"accepted":0,"deduped":1}` on a re-run with the same `event_id`.

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
