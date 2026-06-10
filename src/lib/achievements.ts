/**
 * Global (cross-story) achievement record. Medals are achievements, not
 * per-story progress — so earned medal ids accumulate here, independent of
 * which story's save slot was active when they were won.
 *
 * Stored under a single localStorage key (no storyId). MVP-local; intended
 * to migrate to a per-player server store (Supabase) later — the read/write
 * surface here is deliberately small so that swap is easy.
 */
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { TABLES } from "./supabase/tables";

const KEY = "storyranger:achievements";

export function loadEarnedAchievements(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Add the given medal ids to the global record (idempotent union). */
export function recordEarnedAchievements(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  try {
    const current = new Set(loadEarnedAchievements());
    let changed = false;
    for (const id of ids) {
      if (!current.has(id)) {
        current.add(id);
        changed = true;
      }
    }
    if (changed) {
      window.localStorage.setItem(KEY, JSON.stringify([...current]));
    }
  } catch {
    // Quota exceeded / private mode — non-fatal.
  }
}

function writeLocal(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

async function currentUser() {
  if (!isSupabaseConfigured() || typeof window === "undefined") return null;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { supabase, id: user.id } : null;
  } catch {
    return null;
  }
}

/** Union the given medal ids into the signed-in user's profile.achievements
 *  (cross-device). Best-effort; localStorage already has them. */
export async function recordEarnedAchievementsRemote(
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const u = await currentUser();
  if (!u) return;
  try {
    // Atomic server-side union (docs/migrations/0005). The old
    // SELECT → JS-union → UPDATE flow let two devices racing each other
    // drop the loser's medals (lost update), and silently matched 0 rows
    // when the profile row didn't exist yet — the RPC upserts + unions in
    // one statement under RLS (security invoker).
    await u.supabase.rpc("storyranger_union_achievements", { p_ids: ids });
  } catch {
    /* ignore */
  }
}

/** On login: pull the profile's achievements into the local cache (union) so a
 *  fresh device shows medals earned elsewhere. */
export async function pullAchievementsToLocal(): Promise<void> {
  const u = await currentUser();
  if (!u) return;
  try {
    const { data } = await u.supabase
      .from(TABLES.profiles)
      .select("achievements")
      .eq("id", u.id)
      .maybeSingle();
    const remote = (data?.achievements as string[] | undefined) ?? [];
    if (remote.length === 0) return;
    const merged = new Set<string>([...loadEarnedAchievements(), ...remote]);
    writeLocal([...merged]);
  } catch {
    /* ignore */
  }
}
