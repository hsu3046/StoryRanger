-- 0001_profiles.sql — Supabase Phase 1: user profiles + 3-role model.
--
-- This project SHARES its Supabase instance with other apps, so every object
-- is namespaced `storyranger_`. We deliberately do NOT add a trigger on the
-- shared `auth.users` table (that would fire for every other app's signups and
-- risk clobbering their triggers). Instead the app calls `ensureProfile()`
-- (idempotent insert under RLS) after the auth callback to create the row.
--
-- One row per auth.users account. `role` drives access (player default;
-- creator/admin promoted manually by an admin). `hero` is the canonical player
-- identity (name/gender/age); `achievements` is the global cross-story medal-id
-- array that used to live in localStorage.
--
-- Apply with: Supabase MCP apply_migration (or SQL editor). Keep this file in
-- the repo so production schema never diverges from source.

-- ── table ────────────────────────────────────────────────────────────────
create table if not exists public.storyranger_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'player'
    check (role in ('player', 'creator', 'admin')),
  hero jsonb,                                  -- { name, gender, age }
  achievements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── row level security ─────────────────────────────────────────────────────
alter table public.storyranger_profiles enable row level security;

-- A user can read and write ONLY their own profile row.
drop policy if exists "storyranger_profiles_select_own" on public.storyranger_profiles;
create policy "storyranger_profiles_select_own" on public.storyranger_profiles
  for select using (auth.uid() = id);

-- INSERT: a user may create only their OWN row, and only as `player`. Without
-- the `role = 'player'` check a logged-in user could POST a profile row with
-- role='admin' to PostgREST before the app's ensureProfile() runs (self-escalation).
drop policy if exists "storyranger_profiles_insert_own" on public.storyranger_profiles;
create policy "storyranger_profiles_insert_own" on public.storyranger_profiles
  for insert with check (auth.uid() = id and role = 'player');

drop policy if exists "storyranger_profiles_update_own" on public.storyranger_profiles;
create policy "storyranger_profiles_update_own" on public.storyranger_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── role cannot be self-escalated (column privilege, fail-closed) ──────────
-- RLS can restrict ROWS but not a single COLUMN, so a `for update` policy
-- can't stop a user editing their own `role`. A trigger keyed on auth.role()
-- is fail-OPEN (auth.role() is NULL when the JWT role claim is absent, so the
-- guard silently lets the change through). Use a Postgres COLUMN privilege
-- instead: authenticated/anon may update their own row (hero, achievements,
-- display_name) but are physically unable to write `role`. This is fail-CLOSED
-- and independent of any JWT claim. The service-role key (admin user-management)
-- keeps full privileges, and a superuser (SQL editor) can bootstrap the first
-- admin. Combined with the INSERT policy's `role = 'player'`, a user can never
-- grant themselves a privileged role through PostgREST.
revoke update (role) on public.storyranger_profiles from authenticated, anon;

-- keep updated_at fresh
create or replace function public.storyranger_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists storyranger_profiles_touch_updated_at on public.storyranger_profiles;
create trigger storyranger_profiles_touch_updated_at
  before update on public.storyranger_profiles
  for each row execute function public.storyranger_touch_updated_at();
