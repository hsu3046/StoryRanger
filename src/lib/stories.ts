import type { CharactersFile, Story } from "@/types/story";
import type {
  EncountersFileT,
  ItemsFileT,
  MonstersFileT,
} from "@/data/schemas";

import { STORY_MODULES } from "@/stories/_registry.generated";

export interface LoadedStory {
  story: Story;
  characters: CharactersFile;
  /** Per-story catalogs — carried here so the content repo + runtime engine
   *  can key monsters / items / encounters by storyId instead of importing a
   *  single hardcoded wizard-of-oz global. */
  monsters: MonstersFileT;
  items: ItemsFileT;
  encounters: EncountersFileT;
}

/**
 * Story registry, built from the generated barrel (`_registry.generated.ts`).
 * The barrel is rewritten by the admin scaffold/commit actions, so adding a
 * story is a code change (static import) that stays bundled at build time —
 * no runtime filesystem reads.
 */
const REGISTRY: Record<string, LoadedStory> = Object.fromEntries(
  Object.entries(STORY_MODULES).map(([id, m]) => [
    id,
    {
      story: m.story,
      characters: m.charactersFile,
      monsters: m.monstersFile,
      items: m.itemsFile,
      encounters: m.encountersFile,
    },
  ]),
);

export function getStory(storyId: string): LoadedStory | null {
  return REGISTRY[storyId] ?? null;
}

export function listStoryIds(): string[] {
  return Object.keys(REGISTRY);
}
