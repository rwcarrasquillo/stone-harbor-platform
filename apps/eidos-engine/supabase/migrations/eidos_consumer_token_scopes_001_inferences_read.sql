-- EID-52 — Add `inferences:read` scope to the stone_harbor consumer token.
--
-- The token previously held only ['events:write']. The new consumer-
-- scoped read endpoint at
--   GET /api/v1/consumers/me/members/[user_id]/inferences
-- requires `inferences:read`. Adding it here so the existing token
-- can hit the new route without needing a fresh mint + rotation.
--
-- Scope semantics going forward:
--   events:write     — POST /api/v1/events (host pushes events)
--   inferences:read  — GET /api/v1/consumers/me/.../inferences (host reads own member's data)
--
-- Future per-consumer tokens for new hosts (The Long Light, future
-- partners) should be minted with BOTH scopes by default — a host
-- that writes events but can't read inferences is in a weird half-
-- integrated state. Strict separation only matters if we eventually
-- have read-only API consumers (analytics dashboards, etc.), and
-- that's not a use case today.
--
-- Idempotent: the array assignment is the same regardless of starting
-- state, and we still gate on `revoked_at IS NULL` so we don't touch
-- the leaked / revoked rows from EID-38.

UPDATE public.eidos_consumer_tokens
SET scopes = ARRAY['events:write', 'inferences:read']::text[]
WHERE consumer_id = 'stone_harbor'
  AND revoked_at IS NULL;
