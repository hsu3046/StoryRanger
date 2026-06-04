import type { PlayState } from "@/types/story";
import { DEFAULT_HERO } from "./narrative";
import { encountersFor } from "@/data/encounters";
import { MEDALS } from "@/data/medals";
import { checkMedals } from "@/lib/medals-engine";

/**
 * Renames of stable IDs across versions. Saves out in the wild may still
 * carry the old id (e.g. medal `ruby_slippers` renamed to `silver_shoes`
 * after we aligned the wording with the book canon). On hydrate we rewrite
 * old ids to their new counterpart so the inventory / medal shelf stays
 * coherent without forcing a reset.
 */
const MEDAL_ID_RENAMES: Record<string, string> = {
  ruby_slippers: "silver_shoes",
};

/**
 * Save key format: `storyranger:{slot}:{storyId}`.
 *
 * The slot lets the admin Demo mode persist progress under a separate key
 * (`demo`) so it doesn't clobber the real player's `play` slot. Both share
 * the same hydration / backfill logic.
 */
const KEY_PREFIX = "storyranger";

function keyFor(slot: string, storyId: string): string {
  return `${KEY_PREFIX}:${slot}:${storyId}`;
}

export function saveState(state: PlayState, slot: string = "play"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      keyFor(slot, state.storyId),
      JSON.stringify(state),
    );
  } catch {
    // Quota exceeded or private mode — silent ignore (single-slot, small payload).
  }
}

export function loadState(
  storyId: string,
  slot: string = "play",
): PlayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(slot, storyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayState;
    // Backfill hero for saves created before the personalization feature.
    if (!parsed.hero) {
      parsed.hero = { ...DEFAULT_HERO };
    } else if (typeof parsed.hero.age !== "number") {
      // Saves predating the onboarding age step — default to the mid tier.
      parsed.hero.age = DEFAULT_HERO.age;
    }
    if (!parsed.partyHp) parsed.partyHp = { hero: 3 };
    if (!parsed.partyMaxHp) parsed.partyMaxHp = { hero: 3 };
    if (!parsed.fallenAttackers) parsed.fallenAttackers = [];
    if (!parsed.completedEncounters) parsed.completedEncounters = [];
    if (!parsed.completedSceneRewards) parsed.completedSceneRewards = [];
    if (!parsed.companionMoods) parsed.companionMoods = {};
    if (!parsed.dialogueHistory) parsed.dialogueHistory = {};
    if (!parsed.inventory) parsed.inventory = [];
    if (!parsed.companions) parsed.companions = [];
    if (!parsed.branchHistory) parsed.branchHistory = [];
    if (!parsed.giftedCharacters) parsed.giftedCharacters = [];
    if (!parsed.unlockedKeywords) parsed.unlockedKeywords = [];
    if (typeof parsed.dialogueCount !== "number") parsed.dialogueCount = 0;

    // Apply id renames, then drop ids no longer in the catalog. Old
    // trigger-based saves carry medals (e.g. `tornado_survivor`, `silver_shoes`)
    // that the metric catalog replaced; left in place they inflate the ending
    // panel count (`earnedMedals.length`) and get re-recorded as global
    // achievements. De-dupe too, in case a rename collides with an id already
    // present.
    const validMedalIds = new Set(MEDALS.medals.map((m) => m.id));
    parsed.earnedMedals = [
      ...new Set(
        (parsed.earnedMedals ?? [])
          .map((id) => MEDAL_ID_RENAMES[id] ?? id)
          .filter((id) => validMedalIds.has(id)),
      ),
    ];

    // Backfill metric medals whose thresholds the restored counters already
    // meet — e.g. a save that predates a medal, or one whose stale ids were
    // just dropped above. Without this the player would only be granted them
    // on their NEXT qualifying action (next friend / battle / dialogue …).
    const backfilled = checkMedals(MEDALS, parsed);
    if (backfilled.length > 0) {
      parsed.earnedMedals = [
        ...new Set([...parsed.earnedMedals, ...backfilled.map((m) => m.id)]),
      ];
    }

    // interaction field is opt-in; missing is the natural "no overlay" state.
    // Sanity-check shape so a corrupted save doesn't crash the player.
    if (parsed.interaction) {
      const k = (parsed.interaction as { kind?: unknown }).kind;
      if (k !== "challenge" && k !== "outcome" && k !== "encounter") {
        delete parsed.interaction;
      } else if (k === "encounter") {
        // Drop queued encounter ids that no longer exist in the catalog —
        // happens after a data-side rename or deletion. If everything
        // drops we clear the overlay so the player resumes on the scene.
        const validIds = new Set(encountersFor(storyId).map((e) => e.id));
        const enc = parsed.interaction as {
          kind: "encounter";
          sourceSceneId?: string;
          queue: string[];
          battle?: unknown;
        };
        // sourceSceneId was added later — older saves mid-battle lack it. Pin
        // it to the persisted currentSceneId so the backdrop derivation has a
        // valid scene (the engine is already at the destination, but for a
        // resumed battle that's an acceptable, non-flashing fallback).
        if (!enc.sourceSceneId) enc.sourceSceneId = parsed.currentSceneId;
        enc.queue = enc.queue.filter((id) => validIds.has(id));
        // Sanity-check the persisted battle blob. We can't validate the
        // full BattleState shape without a circular import, but we can at
        // least confirm it's a non-null object so the BattleScreen cast
        // doesn't blow up on a primitive / null.
        if (enc.battle !== undefined && (typeof enc.battle !== "object" || enc.battle === null)) {
          delete enc.battle;
        }
        if (enc.queue.length === 0) delete parsed.interaction;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearState(storyId: string, slot: string = "play"): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(keyFor(slot, storyId));
}
