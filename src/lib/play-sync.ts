/**
 * Remote (Supabase) progress sync. The browser keeps writing localStorage
 * instantly for offline/UX; these helpers mirror to `storyranger_play_states`
 * (state + review columns) under RLS. Every function degrades gracefully —
 * when Supabase isn't configured or the user is logged out, it no-ops / returns
 * null so the localStorage path stays authoritative.
 */
import type { PlayState } from "@/types/story";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { TABLES } from "./supabase/tables";
import { sanitizePlayState, loadState, localPlayStoryIds } from "./storage";
import { loadReview, type ReviewItem } from "./review-store";
import { loadEarnedAchievements } from "./achievements";

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  try {
    const {
      data: { user },
    } = await createClient().auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function loadRemotePlayState(
  storyId: string,
): Promise<PlayState | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  try {
    const { data } = await createClient()
      .from(TABLES.playStates)
      .select("state")
      .eq("user_id", uid)
      .eq("story_id", storyId)
      .maybeSingle();
    const raw = (data?.state ?? null) as PlayState | null;
    return raw ? sanitizePlayState(raw, storyId) : null;
  } catch {
    return null;
  }
}

export async function upsertRemotePlayState(state: PlayState): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await createClient()
      .from(TABLES.playStates)
      .upsert(
        {
          user_id: uid,
          story_id: state.storyId,
          state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,story_id" },
      );
  } catch {
    /* best-effort — localStorage already has it */
  }
}

export async function deleteRemotePlayState(storyId: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await createClient()
      .from(TABLES.playStates)
      .delete()
      .eq("user_id", uid)
      .eq("story_id", storyId);
  } catch {
    /* ignore */
  }
}

/** Write the canonical hero onto the signed-in user's profile (cross-device,
 *  reused as the default for future "Start a new adventure"). Best-effort. */
export async function saveProfileHero(
  hero: PlayState["hero"],
): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  try {
    await createClient().from(TABLES.profiles).update({ hero }).eq("id", uid);
  } catch {
    /* ignore */
  }
}

export interface RemoteSave {
  state: PlayState | null;
  review: ReviewItem[];
}

/** All of the signed-in user's saves, keyed by storyId (for the home carousel). */
export async function loadAllRemotePlay(): Promise<Record<string, RemoteSave>> {
  const uid = await currentUserId();
  if (!uid) return {};
  try {
    const { data } = await createClient()
      .from(TABLES.playStates)
      .select("story_id, state, review")
      .eq("user_id", uid);
    const out: Record<string, RemoteSave> = {};
    for (const row of (data ?? []) as Array<{
      story_id: string;
      state: PlayState | null;
      review: ReviewItem[] | null;
    }>) {
      out[row.story_id] = {
        state: row.state ? sanitizePlayState(row.state, row.story_id) : null,
        review: Array.isArray(row.review) ? row.review : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

const MIGRATED_PREFIX = "storyranger:migrated:";

/** Shared in-flight promise so a StrictMode double-invoke / two near-concurrent
 *  mounts in the SAME tab run the migration once. (Separate tabs still race,
 *  but the upsert+ignoreDuplicates below makes that safe.) */
let migrationInFlight: Promise<void> | null = null;

/**
 * One-time, idempotent localStorage → Supabase import on first login. Imports
 * each local save the DB doesn't already have (DB wins to protect newer
 * cross-device progress), folds in review history, seeds the profile hero, and
 * unions global achievements. The "migrated" flag is set ONLY when every write
 * succeeded — a partial failure leaves it unset so a later mount retries
 * (re-runs are idempotent: the `have` filter + upsert/ignoreDuplicates). Never
 * blocks the UI.
 */
export async function migrateLocalToRemoteOnce(): Promise<void> {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = runMigration().finally(() => {
    migrationInFlight = null;
  });
  return migrationInFlight;
}

async function runMigration(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const flag = MIGRATED_PREFIX + uid;
  try {
    if (window.localStorage.getItem(flag) === "1") return;
  } catch {
    return;
  }

  let failedAny = false;
  try {
    const supabase = createClient();

    const { data: existing, error: exErr } = await supabase
      .from(TABLES.playStates)
      .select("story_id, state")
      .eq("user_id", uid);
    if (exErr) return; // can't read the baseline → bail, retry next mount
    const rows = (existing ?? []) as Array<{
      story_id: string;
      state: unknown;
    }>;
    // Rows that already hold a real PlayState → DB wins, skip. A row with
    // state=null is review-only (review synced before any save), so we still
    // import this device's local state into it (without touching its review).
    const haveState = new Set(
      rows.filter((r) => r.state != null).map((r) => r.story_id),
    );
    const haveRow = new Set(rows.map((r) => r.story_id));

    let heroSeed: PlayState["hero"] | null = null;
    for (const storyId of localPlayStoryIds()) {
      const state = loadState(storyId);
      if (state?.hero && !heroSeed) heroSeed = state.hero;
      if (!state || haveState.has(storyId)) continue;
      if (haveRow.has(storyId)) {
        // Review-only remote row → fill `state`, keep the remote review.
        const { error } = await supabase
          .from(TABLES.playStates)
          .update({ state, updated_at: new Date().toISOString() })
          .eq("user_id", uid)
          .eq("story_id", storyId);
        if (error) failedAny = true;
      } else {
        // No remote row → insert state + local review. ignoreDuplicates keeps
        // the DB copy if the row appeared since the select (race / second tab).
        const { error } = await supabase
          .from(TABLES.playStates)
          .upsert(
            {
              user_id: uid,
              story_id: storyId,
              state,
              review: loadReview(storyId),
            },
            { onConflict: "user_id,story_id", ignoreDuplicates: true },
          );
        if (error) failedAny = true;
      }
    }

    // Seed profile hero (if unset) + union local achievements.
    const localAch = loadEarnedAchievements();
    const { data: prof, error: profErr } = await supabase
      .from(TABLES.profiles)
      .select("hero, achievements")
      .eq("id", uid)
      .maybeSingle();
    if (profErr) failedAny = true;
    const update: { hero?: unknown; achievements?: string[] } = {};
    if (prof && !prof.hero && heroSeed) update.hero = heroSeed;
    if (localAch.length) {
      const merged = new Set<string>([
        ...((prof?.achievements as string[] | undefined) ?? []),
        ...localAch,
      ]);
      update.achievements = [...merged];
    }
    if (Object.keys(update).length) {
      const { error } = await supabase
        .from(TABLES.profiles)
        .update(update)
        .eq("id", uid);
      if (error) failedAny = true;
    }

    if (!failedAny) {
      try {
        window.localStorage.setItem(flag, "1");
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* thrown (e.g. network) → leave the flag unset for a retry */
  }
}
