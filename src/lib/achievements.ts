/**
 * Global (cross-story) achievement record. Medals are achievements, not
 * per-story progress — so earned medal ids accumulate here, independent of
 * which story's save slot was active when they were won.
 *
 * Stored under a single localStorage key (no storyId). MVP-local; intended
 * to migrate to a per-player server store (Supabase) later — the read/write
 * surface here is deliberately small so that swap is easy.
 */
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
