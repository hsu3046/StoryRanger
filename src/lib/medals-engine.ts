import type { Medal, MedalMetric, MedalsFile, PlayState } from "@/types/story";

/**
 * Cumulative play metrics derived from PlayState. Medals are awarded purely
 * from these counters (no per-scene/branch triggers), so the catalog is
 * story-agnostic — a medal like "make 3 friends" works in any story.
 *
 * Every metric is derivable from existing state — no extra tracking needed.
 */
export function computeMetrics(state: PlayState): Record<MedalMetric, number> {
  return {
    friends: state.companions.length,
    dialogues: state.dialogueCount,
    battles: (state.completedEncounters ?? []).length,
    choices: state.branchHistory.length,
    gifts: (state.giftedCharacters ?? []).length,
  };
}

/**
 * Medals newly earned at this state — any whose metric has reached its
 * threshold and isn't already earned. The caller appends the ids to
 * `state.earnedMedals` and dispatches the toast UI.
 */
export function checkMedals(catalog: MedalsFile, state: PlayState): Medal[] {
  const already = new Set(state.earnedMedals);
  const metrics = computeMetrics(state);
  return catalog.medals.filter(
    (m) => !already.has(m.id) && metrics[m.metric] >= m.threshold,
  );
}
