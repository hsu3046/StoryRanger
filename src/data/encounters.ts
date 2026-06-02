/**
 * Encounter catalog — read per-story from the loaded story module.
 *
 * Encounters belong to BRANCH traversals, so the lookup helper keys off
 * (storyId, sceneId, branchId). Previously a single hardcoded wizard-of-oz
 * global (`ENCOUNTERS`); now keyed by storyId via `getStory`.
 */

import { getStory } from "@/lib/stories";
import type { EncounterDef } from "@/types/encounter";

export function encountersFor(storyId: string): EncounterDef[] {
  return (getStory(storyId)?.encounters.encounters ?? []) as EncounterDef[];
}

export function findEncountersForBranch(
  storyId: string,
  sceneId: string,
  branchId: string,
): EncounterDef[] {
  return encountersFor(storyId).filter(
    (e) => e.trigger.sceneId === sceneId && e.trigger.branchId === branchId,
  );
}

export function getEncounter(storyId: string, id: string): EncounterDef | null {
  return encountersFor(storyId).find((e) => e.id === id) ?? null;
}
