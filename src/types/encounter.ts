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
  /** How many copies of this battle to drop into the shuffle pool when
   *  the branch is taken. Default 1. */
  count?: number;
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

export interface EncounterOutro {
  victory: string;
  defeat?: string;
}

export interface EncounterDef {
  id: string;
  title: string;
  trigger: EncounterTrigger;
  intro: EncounterIntro;
  body: { kind: "battle"; monsterIds: string[] };
  rewards: EncounterRewards;
  outro: EncounterOutro;
  /** Optional monster sprites to show in intro even when monsterIds is empty. */
  displayMonsters?: string[];
}
