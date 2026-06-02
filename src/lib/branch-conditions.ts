import type { Branch, PlayState } from "@/types/story";

/**
 * A branch may carry an optional `condition` gate. It is shown to the player
 * only when EVERY present clause is satisfied (AND), and each clause requires
 * ALL of its listed ids. No condition (or all clauses empty) → always visible.
 *
 * Pure + deterministic — evaluated from the current PlayState at render time,
 * so nothing extra is persisted. Mirrors the shape of `medals-engine.ts`.
 */
export function isBranchVisible(branch: Branch, state: PlayState): boolean {
  const c = branch.condition;
  if (!c) return true;

  if (c.hasItems && c.hasItems.length > 0) {
    const inventory = new Set(state.inventory ?? []);
    if (!c.hasItems.every((id) => inventory.has(id))) return false;
  }

  if (c.hasCompanions && c.hasCompanions.length > 0) {
    const party = new Set(state.companions);
    if (!c.hasCompanions.every((id) => party.has(id))) return false;
  }

  if (c.hasKeywords && c.hasKeywords.length > 0) {
    const unlocked = new Set(state.unlockedKeywords ?? []);
    if (!c.hasKeywords.every((k) => unlocked.has(k))) return false;
  }

  return true;
}
