/**
 * Encounter trigger logic. v3.1:
 *   - Encounters now belong to BRANCH traversals (not scene entries). When
 *     the player takes a branch from sceneId, every encounter whose trigger
 *     matches (sceneId, branchId) is added to the pool. `count` decides how
 *     many copies; the pool is shuffled and consumed before the destination
 *     scene's narration is shown.
 */

import { findEncountersForBranch } from "@/data/encounters";
import type { EncounterDef } from "@/types/encounter";
import type { PlayState } from "@/types/story";

export function buildEncounterQueue(
  storyId: string,
  sceneId: string,
  branchId: string,
  state: PlayState,
): EncounterDef[] {
  const candidates = findEncountersForBranch(storyId, sceneId, branchId);
  const pool: EncounterDef[] = [];

  for (const e of candidates) {
    if (e.trigger.requires) {
      const r = e.trigger.requires;
      if (r.companion && !state.companions.includes(r.companion)) continue;
      if (r.item && !(state.inventory ?? []).includes(r.item)) continue;
    }
    // One battle per encounter — battles no longer repeat (the old
    // `trigger.count` multiplier was removed).
    pool.push(e);
  }

  // Fisher-Yates shuffle.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
