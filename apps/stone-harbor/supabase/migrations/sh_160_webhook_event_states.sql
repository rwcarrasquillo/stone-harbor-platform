-- sh_160_webhook_event_states.sql
--
-- SH-160 (review finding 5): Stripe retries could skip failed work.
--
-- The webhook route used to insert its ledger row before processing. If
-- processing threw, the row stayed, and Stripe's retry was answered as a
-- duplicate (200), so the work was never completed.
--
-- Now each event has a status. Only `completed` events count as duplicates;
-- `failed` events, and `processing` events whose claim has gone stale (a
-- crashed run), are re-claimed atomically by claim_webhook_event().
--
-- Additive and backward compatible: existing rows were all handled, so they
-- default to `completed`, and the old route code keeps working until the new
-- code ships.

alter table public.webhook_events
  add column if not exists status text not null default 'completed'
    check (status in ('processing', 'completed', 'failed')),
  add column if not exists attempts integer not null default 1,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

-- Returns 'claimed' (caller must process), 'duplicate' (already completed)
-- or 'in_progress' (another delivery is processing it right now).
create or replace function public.claim_webhook_event(
  p_event_id text,
  p_event_type text,
  p_stale_after interval default interval '5 minutes'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_updated timestamptz;
begin
  insert into public.webhook_events (event_id, event_type, status, attempts, updated_at)
  values (p_event_id, p_event_type, 'processing', 1, now())
  on conflict (event_id) do nothing;
  if found then
    return 'claimed';
  end if;

  select status, updated_at into v_status, v_updated
    from public.webhook_events
   where event_id = p_event_id
   for update;

  if v_status = 'completed' then
    return 'duplicate';
  end if;

  if v_status = 'failed'
     or (v_status = 'processing' and v_updated < now() - p_stale_after) then
    update public.webhook_events
       set status = 'processing',
           attempts = attempts + 1,
           last_error = null,
           updated_at = now()
     where event_id = p_event_id;
    return 'claimed';
  end if;

  return 'in_progress';
end;
$$;

revoke all on function public.claim_webhook_event(text, text, interval) from public, anon, authenticated;
grant execute on function public.claim_webhook_event(text, text, interval) to service_role;
