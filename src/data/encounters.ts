/**
 * Encounter catalog — loaded from JSON via Zod-validated content layer.
 * v3.1: encounters belong to BRANCH traversals (not scene entries), so the
 * lookup helper now keys off (sceneId, branchId).
 */

import encountersJson from "@/stories/wizard-of-oz/encounters.json";
import { EncountersFileSchema } from "./schemas";
import type { EncounterDef } from "@/types/encounter";

const parsed = EncountersFileSchema.parse(encountersJson);

export const ENCOUNTERS: EncounterDef[] = parsed.encounters as EncounterDef[];

export function findEncountersForBranch(
  sceneId: string,
  branchId: string,
): EncounterDef[] {
  return ENCOUNTERS.filter(
    (e) =>
      e.trigger.sceneId === sceneId && e.trigger.branchId === branchId,
  );
}

export function getEncounter(id: string): EncounterDef | null {
  return ENCOUNTERS.find((e) => e.id === id) ?? null;
}
