import type { StoryboardBeatT } from "@/data/schemas";
import { slugify } from "./slugify";

/**
 * Map each raw storyboard beat id → the final scene-record key.
 *
 * SINGLE source of the beat-id → scene-key mapping, shared by ScenesStep
 * (assembly) and the wizard's Scenes-step resume detection so they can't drift:
 *   - slugify the beat id,
 *   - fall back to `scene-N` when slugify yields "" (e.g. a non-ASCII id),
 *   - dedupe collisions with a `-2` suffix.
 *
 * Pure (only depends on slugify), so it's safe to import from both the client
 * ScenesStep component and the server wizard page.
 */
export function buildBeatKeyMap(
  beats: readonly StoryboardBeatT[],
): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  beats.forEach((beat, i) => {
    let key = slugify(beat.id) || `scene-${i + 1}`;
    while (used.has(key)) key = `${key}-2`;
    used.add(key);
    map.set(beat.id, key);
  });
  return map;
}
