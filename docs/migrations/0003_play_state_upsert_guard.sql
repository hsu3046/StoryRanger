-- 0003_play_state_upsert_guard.sql — atomic, stale-write-guarded play-state save.
--
-- A plain upsert lets an OLDER in-flight save overwrite newer progress when
-- requests finish out of order (a debounced/tab-hide flush for state T1 lands
-- after the player already saved T2). This RPC does the insert-or-update in one
-- statement and only overwrites when the incoming state.updatedAt is >= the
-- stored one, so a late stale write is a no-op. SECURITY INVOKER → RLS still
-- applies and auth.uid() is the caller; the WHERE on conflict is the guard.
--
-- ISO-8601 updatedAt strings sort chronologically as text, so a lexical compare
-- is a correct time compare.

create or replace function public.storyranger_save_play_state(
  p_story_id text,
  p_state jsonb
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.storyranger_play_states (user_id, story_id, state, updated_at)
  values (auth.uid(), p_story_id, p_state, now())
  on conflict (user_id, story_id) do update
    set state = excluded.state,
        updated_at = now()
    where coalesce(public.storyranger_play_states.state ->> 'updatedAt', '')
          <= coalesce(excluded.state ->> 'updatedAt', '');
$$;
