/**
 * Wrong-answer review store — the data behind the home "Check Your Answers"
 * study tool. Records every educational question the player got wrong (branch
 * gates + battles) so they can re-solve only those later.
 *
 * Lives in its OWN per-story localStorage key, deliberately SEPARATE from the
 * PlayState save: "Start a new adventure" calls `clearState()` which wipes the
 * whole PlayState, but study data must survive across playthroughs. So this is
 * never cleared by the new-adventure flow (only by explicit `clearReview`).
 *
 * Same defensive conventions as storage.ts: SSR-guarded, try/catch, never
 * throws — a corrupt/oversized blob degrades to "no review items" rather than
 * crashing the home screen. Timestamps are passed in by callers (event
 * handlers), keeping this module pure.
 */
import type { Challenge } from "./education";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { TABLES } from "./supabase/tables";

const KEY_PREFIX = "storyranger:review";
const SCHEMA_VERSION = 1;
/** Cap the stored list so localStorage stays small; oldest (by lastSeen) drop. */
const MAX_ITEMS = 100;

function reviewKey(storyId: string): string {
  return `${KEY_PREFIX}:${storyId}`;
}

export type ReviewSource = "gate" | "battle";

export interface ReviewItem {
  /** Stable dedup identity — see `reviewKeyOf`. */
  key: string;
  /** The full, replayable problem (plain JSON; re-rendered via EducationalChallenge). */
  challenge: Challenge;
  source: ReviewSource;
  /** How many times this exact question has been missed. */
  missedCount: number;
  /** ISO timestamps. */
  firstSeen: string;
  lastSeen: string;
}

interface ReviewFile {
  version: number;
  items: ReviewItem[];
}

/**
 * Dedup identity: the question AS THE PLAYER SAW IT. category + prompt +
 * choices alone is NOT enough — visual challenges (e.g. "What shape is this?")
 * reuse the same prompt and choice set, with the VISUAL and the correct answer
 * being what actually differ (a triangle vs a square card). So the key also
 * folds in `correctIndex` and the serialized `visual`. Joined with non-printing
 * separators (US / RS) so a literal character inside a field can't forge a key
 * boundary.
 */
export function reviewKeyOf(c: Challenge): string {
  return [
    c.category,
    c.prompt,
    c.choices.join("␞"),
    String(c.correctIndex),
    c.visual ? JSON.stringify(c.visual) : "",
  ].join("␟");
}

/** A stored item is usable only if its challenge can actually be replayed —
 *  including a correctIndex that points at a real choice (a corrupt blob with
 *  an out-of-range index would mis-render the card). */
function isValidItem(it: unknown): it is ReviewItem {
  if (!it || typeof it !== "object") return false;
  const r = it as Record<string, unknown>;
  const c = r.challenge as Record<string, unknown> | undefined;
  if (typeof r.key !== "string" || !c) return false;
  if (typeof c.prompt !== "string" || typeof c.category !== "string") return false;
  if (!Array.isArray(c.choices) || !c.choices.every((x) => typeof x === "string"))
    return false;
  return (
    typeof c.correctIndex === "number" &&
    c.correctIndex >= 0 &&
    c.correctIndex < c.choices.length
  );
}

function readFile(storyId: string): ReviewFile {
  if (typeof window === "undefined") return { version: SCHEMA_VERSION, items: [] };
  try {
    const raw = window.localStorage.getItem(reviewKey(storyId));
    if (!raw) return { version: SCHEMA_VERSION, items: [] };
    const parsed = JSON.parse(raw) as Partial<ReviewFile>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter(isValidItem)
      : [];
    return { version: SCHEMA_VERSION, items };
  } catch {
    return { version: SCHEMA_VERSION, items: [] };
  }
}

function writeFile(storyId: string, file: ReviewFile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(reviewKey(storyId), JSON.stringify(file));
  } catch {
    // Quota / private mode — silent ignore (study data is best-effort).
  }
}

/** Push the current review list to the signed-in user's play_states row
 *  (`review` column). UPSERT — if no row exists yet (a wrong answer before the
 *  first PlayState save), create a review-only row (state stays null until the
 *  play-state sync fills it); on conflict only the `review`/`updated_at`
 *  columns are written, so the existing `state` is untouched. Best-effort. */
async function pushRemote(storyId: string, items: ReviewItem[]): Promise<void> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from(TABLES.playStates).upsert(
      {
        user_id: user.id,
        story_id: storyId,
        review: items,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,story_id" },
    );
  } catch {
    /* ignore */
  }
}

/**
 * Reconcile the local review cache with the remote list on login / hydration,
 * returning the merged items. Remote is authoritative for what it knows about
 * (so masters/clears on another device — incl. an empty list — propagate), BUT
 * a local item recorded AFTER the remote row was last written is an unsynced
 * miss (a fire-and-forget push that failed) and is preserved + re-pushed. Items
 * absent from remote and older than the remote write were mastered/cleared
 * elsewhere and are dropped. `remoteUpdatedAt` is the remote row's updated_at.
 */
export function mergeRemoteReview(
  storyId: string,
  remoteItems: ReviewItem[],
  remoteUpdatedAt: string | null,
): ReviewItem[] {
  const remote = remoteItems.filter(isValidItem);
  const remoteKeys = new Set(remote.map((it) => it.key));
  const remoteT = Date.parse(remoteUpdatedAt ?? "") || 0;
  const localExtras = readFile(storyId).items.filter(
    (it) => !remoteKeys.has(it.key) && (Date.parse(it.lastSeen) || 0) > remoteT,
  );
  const merged = [...remote, ...localExtras];
  if (typeof window !== "undefined") {
    writeFile(storyId, { version: SCHEMA_VERSION, items: merged });
  }
  // Re-push the unsynced local misses so they finally reach the DB.
  if (localExtras.length > 0) void pushRemote(storyId, merged);
  return merged;
}

/** All wrong questions stored for a story (oldest → most-recently-missed). */
export function loadReview(storyId: string): ReviewItem[] {
  return readFile(storyId).items;
}

/** Number of questions currently queued for review. */
export function reviewCount(storyId: string): number {
  return readFile(storyId).items.length;
}

/**
 * Record a missed question. Dedups by `reviewKeyOf`: a repeat bumps
 * `missedCount` + `lastSeen` and moves it to the end (most-recent); a new one
 * is appended. The list is capped to MAX_ITEMS, dropping the oldest.
 */
export function recordWrong(
  storyId: string,
  challenge: Challenge,
  source: ReviewSource,
  nowIso: string,
): void {
  const file = readFile(storyId);
  const key = reviewKeyOf(challenge);
  const existing = file.items.find((it) => it.key === key);
  if (existing) {
    existing.missedCount += 1;
    existing.lastSeen = nowIso;
    // Move to end so the cap drops genuinely stale items, not recently-missed ones.
    file.items = [...file.items.filter((it) => it.key !== key), existing];
  } else {
    file.items.push({
      key,
      challenge,
      source,
      missedCount: 1,
      firstSeen: nowIso,
      lastSeen: nowIso,
    });
  }
  if (file.items.length > MAX_ITEMS) {
    file.items = file.items.slice(file.items.length - MAX_ITEMS);
  }
  writeFile(storyId, file);
  void pushRemote(storyId, file.items);
}

/** Remove a question once the player solves it correctly in review ("mastered"). */
export function markMastered(storyId: string, key: string): void {
  const file = readFile(storyId);
  const next = file.items.filter((it) => it.key !== key);
  if (next.length !== file.items.length) {
    writeFile(storyId, { ...file, items: next });
    void pushRemote(storyId, next);
  }
}

/** Wipe the review list for a story. NOT called by the new-adventure flow —
 *  study data is meant to persist across playthroughs. Exposed for a manual
 *  "clear my practice list" action. */
export function clearReview(storyId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(reviewKey(storyId));
  } catch {
    // ignore
  }
  void pushRemote(storyId, []);
}
