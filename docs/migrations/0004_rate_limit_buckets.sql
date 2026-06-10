-- 0004: Per-user rate limiting for paid API routes (/api/tts, /api/dialogue).
--
-- Fixed-window counters (minute + day) keyed by (user, route, window). A
-- single SECURITY DEFINER RPC atomically increments both windows and reports
-- whether the caller is over either limit — one round trip per request.
--
-- Weights: /api/tts consumes `weight = max(text length, 125)` characters so
-- the budget maps directly to ElevenLabs credits AND tiny-text hammering is
-- still bounded (5,000-char minute budget / 125 floor = max 40 req/min).
-- /api/dialogue consumes weight 1 per request.
--
-- Naming: the Supabase instance is shared, so every StoryRanger object keeps
-- the `storyranger_` prefix (same as storyranger_profiles / _play_states).
--
-- SERVICE-ROLE ONLY: execute is revoked from anon/authenticated so the RPC
-- cannot be driven (or self-inflated) via PostgREST directly; only the server
-- admin client calls it. The table has RLS enabled with no policies → no
-- PostgREST access at all.

create table if not exists public.storyranger_rate_limit_buckets (
  user_id uuid not null,
  route text not null,
  window_start timestamptz not null,
  count bigint not null default 0,
  primary key (user_id, route, window_start)
);

-- Cleanup scans delete by age.
create index if not exists storyranger_rate_limit_buckets_window_idx
  on public.storyranger_rate_limit_buckets (window_start);

-- Deny-all via PostgREST (no policies on purpose).
alter table public.storyranger_rate_limit_buckets enable row level security;

create or replace function public.storyranger_rate_limit_consume(
  p_user_id uuid,
  p_route text,
  p_weight int,
  p_minute_max int,
  p_day_max int
)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_minute timestamptz := date_trunc('minute', v_now);
  v_day timestamptz := date_trunc('day', v_now);
  v_minute_count bigint;
  v_day_count bigint;
begin
  -- Opportunistic cleanup (~2% of calls) — the table stays a few rows/user.
  if random() < 0.02 then
    delete from storyranger_rate_limit_buckets where window_start < v_now - interval '2 days';
  end if;

  -- Atomically bump both windows. Incrementing even when over keeps the
  -- statement simple; fixed windows mean it can't extend a lockout.
  insert into storyranger_rate_limit_buckets as b (user_id, route, window_start, count)
  values
    (p_user_id, p_route || ':1m', v_minute, p_weight),
    (p_user_id, p_route || ':1d', v_day, p_weight)
  on conflict (user_id, route, window_start)
    do update set count = b.count + excluded.count;

  select count into v_minute_count from storyranger_rate_limit_buckets
   where user_id = p_user_id and route = p_route || ':1m' and window_start = v_minute;
  select count into v_day_count from storyranger_rate_limit_buckets
   where user_id = p_user_id and route = p_route || ':1d' and window_start = v_day;

  if v_day_count > p_day_max then
    -- Blocked until the next UTC day window.
    return query select false,
      greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::int);
  elsif v_minute_count > p_minute_max then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_minute + interval '1 minute' - v_now)))::int);
  else
    return query select true, 0;
  end if;
end;
$$;

-- Service-role only — never callable from the browser via PostgREST.
revoke all on function public.storyranger_rate_limit_consume(uuid, text, int, int, int) from public;
revoke all on function public.storyranger_rate_limit_consume(uuid, text, int, int, int) from anon;
revoke all on function public.storyranger_rate_limit_consume(uuid, text, int, int, int) from authenticated;
grant execute on function public.storyranger_rate_limit_consume(uuid, text, int, int, int) to service_role;
