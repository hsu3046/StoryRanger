/**
 * Encounter catalog — loaded from JSON via Zod-validated content layer.
 * Side adventures slot between main plot scenes; each rolls based on
 * trigger.chance on scene entry. Keeps existing API surface (`ENCOUNTERS`,
 * `findEncountersFor`, `getEncounter`) intact.
 */

import encountersJson from "@/stories/wizard-of-oz/encounters.json";
import { EncountersFileSchema } from "./schemas";
import type { EncounterDef } from "@/types/encounter";

const parsed = EncountersFileSchema.parse(encountersJson);

export const ENCOUNTERS: EncounterDef[] = parsed.encounters as EncounterDef[];

export function findEncountersFor(sceneId: string): EncounterDef[] {
  return ENCOUNTERS.filter((e) => e.trigger.afterScene === sceneId);
}

export function getEncounter(id: string): EncounterDef | null {
  return ENCOUNTERS.find((e) => e.id === id) ?? null;
}
