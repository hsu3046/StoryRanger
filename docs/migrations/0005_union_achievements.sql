-- 0005: Atomic achievements union — fixes the lost-update race in
-- recordEarnedAchievementsRemote (audit #47).
--
-- The old client flow was SELECT achievements → union in JS → UPDATE whole
-- array. Two devices pushing different medals near-simultaneously made the
-- later writer overwrite the earlier one's medals, and a missing profile row
-- made the UPDATE silently match 0 rows. This RPC does the union in ONE
-- statement and upserts the row when absent.
--
-- SECURITY INVOKER on purpose: it runs with the caller's privileges, so the
-- existing RLS policies (own row only, insert as 'player') and the column
-- grants from 0001 (achievements is user-mutable; role is not) keep applying
-- — no caller re-validation checklist needed, unlike SECURITY DEFINER.
-- The 0001 touch trigger keeps updated_at fresh on the update path.

create or replace function public.storyranger_union_achievements(p_ids text[])
returns void
language sql
security invoker
set search_path = public
as $$
  insert into storyranger_profiles (id, achievements)
  values (
    auth.uid(),
    coalesce((select jsonb_agg(distinct x) from unnest(p_ids) as x), '[]'::jsonb)
  )
  on conflict (id) do update
    set achievements = (
      select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
      from (
        select jsonb_array_elements_text(storyranger_profiles.achievements) as v
        union
        select unnest(p_ids)
      ) s
    );
$$;

revoke all on function public.storyranger_union_achievements(text[]) from public;
revoke all on function public.storyranger_union_achievements(text[]) from anon;
grant execute on function public.storyranger_union_achievements(text[]) to authenticated;
