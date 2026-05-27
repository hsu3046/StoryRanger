/**
 * Encounter trigger logic — picks at most one side adventure to insert
 * after entering a main scene.
 *
 * Pure (random aside) — given current PlayState + scene id, returns
 * an EncounterDef or null.
 */

import { findEncountersFor } from "@/data/encounters";
import type { EncounterDef } from "@/types/encounter";
import type { PlayState } from "@/types/story";

export function pickEncounterFor(
  sceneId: string,
  state: PlayState,
): EncounterDef | null {
  const candidates = findEncountersFor(sceneId);
  const completed = new Set(state.completedEncounters ?? []);

  for (const e of candidates) {
    if (e.trigger.once && completed.has(e.id)) continue;

    if (e.trigger.requires) {
      const r = e.trigger.requires;
      if (r.companion && !state.companions.includes(r.companion)) continue;
      if (r.item && !(state.inventory ?? []).includes(r.item)) continue;
    }

    if (Math.random() < e.trigger.chance) {
      return e;
    }
  }
  return null;
}
