import type { Medal, MedalsFile, PlayState } from "@/types/story";

export interface CheckContext {
  enteredSceneId?: string;
  tookBranchId?: string;
  reachedEndingId?: string;
}

/**
 * Returns the medals newly earned by this state transition.
 * Caller is responsible for appending them to `state.earnedMedals`
 * and dispatching toast UI.
 */
export function checkNewMedals(
  catalog: MedalsFile,
  state: PlayState,
  ctx: CheckContext,
): Medal[] {
  const already = new Set(state.earnedMedals);
  const newly: Medal[] = [];

  for (const medal of catalog.medals) {
    if (already.has(medal.id)) continue;
    if (matchesTrigger(medal, state, ctx)) {
      newly.push(medal);
    }
  }
  return newly;
}

function matchesTrigger(
  medal: Medal,
  state: PlayState,
  ctx: CheckContext,
): boolean {
  const t = medal.trigger;
  switch (t.type) {
    // Story-specific triggers only fire while playing their own story
    // (medals are a global catalog now).
    case "branch":
      return t.storyId === state.storyId && ctx.tookBranchId === t.branchId;
    case "scene":
      return t.storyId === state.storyId && ctx.enteredSceneId === t.sceneId;
    case "ending":
      return t.storyId === state.storyId && ctx.reachedEndingId === t.endingId;
    case "dialogue_count":
      // Story-agnostic — fires in any story.
      return state.dialogueCount >= t.min;
    case "encounter":
      // Never auto-fires from a scene transition — encounter results push
      // the id straight into earnedMedals.
      return false;
  }
}
