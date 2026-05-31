import type { CompanionId } from "./story";

/**
 * Side encounter — a battle that triggers between main scenes. v3.0:
 * story-kind encounters were folded into Scene (`reward`) and Branch
 * (`puzzle`/`requires`/`reward`/`onFailMode`).
 */

export interface EncounterTrigger {
  /** Source scene the branch originates from. */
  sceneId: string;
  /** Branch id within `sceneId` that, when traversed, may roll this
   *  encounter. */
  branchId: string;
  /** Optional gating requirements. */
  requires?: {
    companion?: CompanionId;
    item?: string;
  };
}

export interface EncounterIntro {
  bg: string;
}

export interface EncounterRewards {
  /** Encounter-level drop items on victory, in addition to monster drops. */
  items?: string[];
  moodBoost?: { companionId: CompanionId; delta: number }[];
}

export interface EncounterDef {
  id: string;
  trigger: EncounterTrigger;
  intro: EncounterIntro;
  body: { kind: "battle"; monsterIds: string[] };
  rewards: EncounterRewards;
  /** Optional monster sprites to show in intro even when monsterIds is empty. */
  displayMonsters?: string[];
}
