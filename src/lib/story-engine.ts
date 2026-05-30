import type {
  AttackerId,
  Branch,
  CompanionId,
  Hero,
  Medal,
  MedalsFile,
  PartyHp,
  PlayState,
  Scene,
  Story,
} from "@/types/story";
import type { RewardT } from "@/data/schemas";
import { checkNewMedals } from "./medals-engine";
import { DEFAULT_HERO } from "./narrative";

export interface TransitionResult {
  state: PlayState;
  scene: Scene;
  earnedMedals: Medal[];
  /** Reward auto-granted on entering the new scene (1-shot per save). */
  sceneReward?: RewardT;
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
    dialogueCount: 0,
    branchHistory: [],
    completedEncounters: [],
    completedSceneRewards: [],
    companionMoods: {},
    dialogueHistory: {},
    inventory: [],
    partyHp: { hero: DEFAULT_MAX_HP.hero },
    partyMaxHp: { hero: DEFAULT_MAX_HP.hero },
    fallenAttackers: [],
    // No overlay on a fresh game — explicit so callers don't accidentally
    // carry an old interaction over via shallow-merge.
    interaction: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Apply a `Reward` to play state — folds items / medal / mood deltas in.
 * Pure. Caller passes the resulting state along.
 */
export function applyReward(state: PlayState, reward: RewardT): PlayState {
  if (!reward) return state;

  const inventory =
    reward.items && reward.items.length > 0
      ? [...(state.inventory ?? []), ...reward.items]
      : state.inventory;

  const earnedMedals =
    reward.medalId && !state.earnedMedals.includes(reward.medalId)
      ? [...state.earnedMedals, reward.medalId]
      : state.earnedMedals;

  const companionMoods = { ...(state.companionMoods ?? {}) };
  if (reward.moodBoost) {
    for (const mb of reward.moodBoost) {
      if (!state.companions.includes(mb.companionId)) continue;
      const cur = companionMoods[mb.companionId] ?? 5;
      companionMoods[mb.companionId] = Math.max(0, Math.min(10, cur + mb.delta));
    }
  }

  return { ...state, inventory, earnedMedals, companionMoods };
}

/**
 * Apply a branch choice: add companion, navigate to next scene, apply
 * branch reward (if any), then auto-grant the new scene's one-shot
 * reward (if any), and detect newly earned medals.
 *
 * NOTE: Caller is responsible for puzzle handling — when `branch.puzzle`
 * exists, the UI runs the puzzle FIRST, then calls `takeBranch` with the
 * branch only after puzzle resolution. Pass `skipReward=true` if the
 * puzzle failed in `skip` mode.
 *
 * Pure — returns a new state. Caller persists & dispatches UI side effects.
 */
export function takeBranch(
  state: PlayState,
  branch: Branch,
  story: Story,
  medalsCatalog: MedalsFile,
  options: { skipReward?: boolean } = {},
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

  // Scene reward — one-shot on first entry to this scene. A failed
  // `skip`-mode puzzle still navigates here but must NOT grant the reward
  // (the puzzle gates it), so honour `skipReward`. Not marked completed
  // either, so a later clean entry can still earn it.
  let sceneReward: RewardT | undefined;
  const sceneRewardDef = (nextScene as Scene & { reward?: RewardT }).reward;
  const completed = new Set(nextState.completedSceneRewards ?? []);
  if (sceneRewardDef && !completed.has(branch.next) && !options.skipReward) {
    nextState = applyReward(nextState, sceneRewardDef);
    nextState = {
      ...nextState,
      completedSceneRewards: [...completed, branch.next],
    };
    sceneReward = sceneRewardDef;
  }

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

  return { state: nextState, scene: nextScene, earnedMedals, sceneReward };
}

function addCompanion(
  current: CompanionId[],
  add?: CompanionId,
): CompanionId[] {
  if (!add || current.includes(add)) return current;
  return [...current, add];
}
