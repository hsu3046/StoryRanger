import type {
  AttackerId,
  Branch,
  CompanionId,
  Hero,
  Medal,
  MedalsFile,
  NarrateResponse,
  PartyHp,
  PlayState,
  Scene,
  Story,
} from "@/types/story";
import { checkNewMedals } from "./medals-engine";
import { DEFAULT_HERO } from "./narrative";

export interface TransitionResult {
  state: PlayState;
  scene: Scene;
  earnedMedals: Medal[];
}

/** Default max HP per attacker (also used as starting HP). */
export const DEFAULT_MAX_HP: Record<AttackerId, number> = {
  hero: 3,
  scarecrow: 2,
  tinman: 2,
  lion: 2,
};

export function newPlayState(story: Story, hero: Hero = DEFAULT_HERO): PlayState {
  return {
    storyId: story.id,
    hero,
    currentSceneId: story.startScene,
    earnedMedals: [],
    companions: [],
    freeInputCount: 0,
    branchHistory: [],
    completedEncounters: [],
    companionMoods: {},
    dialogueHistory: {},
    inventory: [],
    partyHp: { hero: DEFAULT_MAX_HP.hero },
    partyMaxHp: { hero: DEFAULT_MAX_HP.hero },
    fallenAttackers: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply a branch choice: add companion, navigate to next scene, and
 * detect newly earned medals (branch, scene, ending triggers).
 *
 * Pure — returns a new state. Caller persists & dispatches UI side effects.
 */
export function takeBranch(
  state: PlayState,
  branch: Branch,
  story: Story,
  medalsCatalog: MedalsFile,
): TransitionResult {
  const nextScene = story.scenes[branch.next];
  if (!nextScene) {
    throw new Error(`Scene not found: ${branch.next}`);
  }

  const companions = addCompanion(state.companions, branch.addsCompanion);
  const branchHistory = [...state.branchHistory, branch.id];

  // v2.0 — initialise mood for newly added companion at 5/10
  const companionMoods = { ...(state.companionMoods ?? {}) };
  if (branch.addsCompanion && companionMoods[branch.addsCompanion] === undefined) {
    companionMoods[branch.addsCompanion] = 5;
  }

  // Initialise persistent HP for newly added companion at default max.
  const partyHp: PartyHp = { ...(state.partyHp ?? {}) };
  const partyMaxHp: PartyHp = { ...(state.partyMaxHp ?? {}) };
  if (branch.addsCompanion && partyHp[branch.addsCompanion] === undefined) {
    const max = DEFAULT_MAX_HP[branch.addsCompanion];
    partyHp[branch.addsCompanion] = max;
    partyMaxHp[branch.addsCompanion] = max;
  }

  let nextState: PlayState = {
    ...state,
    currentSceneId: branch.next,
    companions,
    companionMoods,
    partyHp,
    partyMaxHp,
    branchHistory,
    updatedAt: new Date().toISOString(),
  };

  const earnedMedals = checkNewMedals(medalsCatalog, nextState, {
    enteredSceneId: branch.next,
    tookBranchId: branch.id,
    reachedEndingId: nextScene.ending?.id,
  });

  if (earnedMedals.length > 0) {
    nextState = {
      ...nextState,
      earnedMedals: [
        ...nextState.earnedMedals,
        ...earnedMedals.map((m) => m.id),
      ],
    };
  }

  return { state: nextState, scene: nextScene, earnedMedals };
}

/**
 * Apply an LLM narrate response: similar to takeBranch but also bumps
 * the free-input counter (which itself may trigger a medal).
 */
export function applyNarrateResponse(
  state: PlayState,
  response: NarrateResponse,
  story: Story,
  medalsCatalog: MedalsFile,
): TransitionResult {
  const nextScene = story.scenes[response.nextSceneId];
  if (!nextScene) {
    throw new Error(`Scene not found: ${response.nextSceneId}`);
  }

  let nextState: PlayState = {
    ...state,
    currentSceneId: response.nextSceneId,
    freeInputCount: state.freeInputCount + 1,
    updatedAt: new Date().toISOString(),
  };

  const earnedMedals = checkNewMedals(medalsCatalog, nextState, {
    enteredSceneId: response.nextSceneId,
    tookBranchId: response.medalTrigger ?? undefined,
    reachedEndingId: nextScene.ending?.id,
  });

  if (earnedMedals.length > 0) {
    nextState = {
      ...nextState,
      earnedMedals: [
        ...nextState.earnedMedals,
        ...earnedMedals.map((m) => m.id),
      ],
    };
  }

  return { state: nextState, scene: nextScene, earnedMedals };
}

function addCompanion(
  current: CompanionId[],
  add?: CompanionId,
): CompanionId[] {
  if (!add || current.includes(add)) return current;
  return [...current, add];
}
