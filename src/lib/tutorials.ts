/**
 * Global (cross-story) record of which tutorial hints the player has already
 * seen. Tutorials are account-level onboarding, not per-story progress — so a
 * hint shown once never repeats, even in a different story's save slot.
 *
 * Stored under a single localStorage key (no storyId), mirroring
 * `achievements.ts`. MVP-local; the small read/write surface keeps a future
 * server (Supabase) swap easy.
 */
const KEY = "storyranger:seenTutorials";

/** The four core mechanics a first-time player is gently introduced to. */
export type TutorialKey = "item" | "dialogue" | "battle" | "challenge";

const ALL: readonly TutorialKey[] = ["item", "dialogue", "battle", "challenge"];

export function loadSeenTutorials(): TutorialKey[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is TutorialKey =>
          ALL.includes(x as TutorialKey),
        )
      : [];
  } catch {
    return [];
  }
}

/** Mark a tutorial as seen (idempotent union). */
export function recordSeenTutorial(key: TutorialKey): void {
  if (typeof window === "undefined") return;
  try {
    const current = new Set(loadSeenTutorials());
    if (current.has(key)) return;
    current.add(key);
    window.localStorage.setItem(KEY, JSON.stringify([...current]));
  } catch {
    // Quota exceeded / private mode — non-fatal.
  }
}

/** Forget all seen tutorials so they replay — backs the Settings "Show
 *  tutorial again" action. */
export function clearSeenTutorials(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
