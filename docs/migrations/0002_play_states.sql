-- 0002_play_states.sql — Supabase Phase 1: per-user, per-story progress.
--
-- Shared Supabase instance → namespaced `storyranger_`. Replaces the browser
-- localStorage saves (`storyranger:play:<storyId>`). One row per (user, story).
-- `state` is the full PlayState JSON blob; `review` is the study / "check your
-- answers" history that used to live in `storyranger:review:<storyId>`. The
-- admin "demo" slot stays localStorage-only and never reaches this table.
--
-- Keep this file in the repo so production schema never diverges from source.

create table if not exists public.storyranger_play_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id text not null,
  -- Nullable on purpose: a review-only row can exist before the first
  -- PlayState save (a wrong answer in the first seconds of a fresh adventure).
  -- The next play-state upsert fills `state`. Readers treat a null state as
  -- "no save" and fall back to localStorage.
  state jsonb,
  review jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  -- When the `review` column was last written, SEPARATELY from `updated_at`
  -- (which state-only saves also bump). Review reconciliation compares a local
  -- item's lastSeen against THIS, so a missed question recorded after the last
  -- review push isn't mistaken for "already synced" just because a state save
  -- advanced updated_at.
  review_updated_at timestamptz not null default now(),
  primary key (user_id, story_id)
);

-- index for "list all of my saves" on the home screen
create index if not exists storyranger_play_states_user_idx
  on public.storyranger_play_states (user_id);

-- ── row level security ─────────────────────────────────────────────────────
alter table public.storyranger_play_states enable row level security;

drop policy if exists "storyranger_play_states_select_own" on public.storyranger_play_states;
create policy "storyranger_play_states_select_own" on public.storyranger_play_states
  for select using (auth.uid() = user_id);

drop policy if exists "storyranger_play_states_insert_own" on public.storyranger_play_states;
create policy "storyranger_play_states_insert_own" on public.storyranger_play_states
  for insert with check (auth.uid() = user_id);

drop policy if exists "storyranger_play_states_update_own" on public.storyranger_play_states;
create policy "storyranger_play_states_update_own" on public.storyranger_play_states
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "storyranger_play_states_delete_own" on public.storyranger_play_states;
create policy "storyranger_play_states_delete_own" on public.storyranger_play_states
  for delete using (auth.uid() = user_id);
