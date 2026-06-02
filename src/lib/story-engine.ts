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
import { checkMedals } from "./medals-engine";
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

/**
 * A scene is a TERMINAL (ending) scene when none of its branches lead to an
 * EXISTING scene — i.e. there's no connected next node. Branches pointing at
 * a missing/not-yet-created scene don't count as a connection, so a scene with
 * only dangling branches still reads as terminal (and a 0-branch scene always
 * is). Connecting a branch to a real scene flips this off automatically.
 *
 * `scene.ending` (id/label) is kept as optional metadata — used for the end
 * screen label + ending-trigger medals — but only takes effect while the
 * scene is terminal; it is never auto-deleted, so medal references can't dangle.
 */
export function isTerminalScene(
  scene: Pick<Scene, "branches">,
  scenes: Record<string, unknown>,
): boolean {
  return !scene.branches.some((b) => Object.prototype.hasOwnProperty.call(scenes, b.next));
}

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
 * Apply a `Reward` to play state — folds items + mood deltas in. (Medals are
 * no longer granted by rewards; they're earned from play metrics — see
 * `checkMedals`.) Pure. Caller passes the resulting state along.
 */
export function applyReward(state: PlayState, reward: RewardT): PlayState {
  if (!reward) return state;

  const inventory =
    reward.items && reward.items.length > 0
      ? [...(state.inventory ?? []), ...reward.items]
      : state.inventory;

  const companionMoods = { ...(state.companionMoods ?? {}) };
  if (reward.moodBoost) {
    for (const mb of reward.moodBoost) {
      if (!state.companions.includes(mb.companionId)) continue;
      const cur = companionMoods[mb.companionId] ?? 5;
      companionMoods[mb.companionId] = Math.max(0, Math.min(10, cur + mb.delta));
    }
  }

  return { ...state, inventory, companionMoods };
}

/**
 * Apply a branch choice: add companion, navigate to next scene, apply
 * branch reward (if any), then auto-grant the new scene's one-shot
 * reward (if any), and detect newly earned medals.
 *
 * NOTE: Caller is responsible for challenge handling — when `branch.challenge`
 * is enabled, the UI runs the educational challenge FIRST, then calls
 * `takeBranch` only after it resolves. Pass `skipReward=true` if the challenge
 * failed in `skip` mode.
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

  // A branch may add and/or remove companions (multiple of each). Removal only
  // drops them from the active party — their mood + HP entries are kept so a
  // later re-join restores the relationship instead of resetting it.
  const adds = branch.addsCompanions ?? [];
  const removes = branch.removesCompanions ?? [];
  let companions = state.companions;
  for (const id of adds) companions = addCompanion(companions, id);
  for (const id of removes) companions = removeCompanion(companions, id);
  const branchHistory = [...state.branchHistory, branch.id];

  // v2.0 — initialise mood for each newly added companion at 5/10
  const companionMoods = { ...(state.companionMoods ?? {}) };
  for (const id of adds) {
    if (companionMoods[id] === undefined) companionMoods[id] = 5;
  }

  // Initialise persistent HP for each newly added companion at default max.
  const partyHp: PartyHp = { ...(state.partyHp ?? {}) };
  const partyMaxHp: PartyHp = { ...(state.partyMaxHp ?? {}) };
  for (const id of adds) {
    if (partyHp[id] === undefined) {
      const max = DEFAULT_MAX_HP[id];
      partyHp[id] = max;
      partyMaxHp[id] = max;
    }
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

  // Award any metric medals now reached (e.g. choices/friends counters
  // changed by this branch).
  const earnedMedals = checkMedals(medalsCatalog, nextState);

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

/** Drop a companion from the active party (no-op if absent). Mood + HP are
 *  intentionally NOT cleared by the caller, so a later re-join restores them. */
function removeCompanion(
  current: CompanionId[],
  remove?: CompanionId,
): CompanionId[] {
  if (!remove || !current.includes(remove)) return current;
  return current.filter((id) => id !== remove);
}
