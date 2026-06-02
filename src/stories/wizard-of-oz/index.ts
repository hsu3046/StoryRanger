import type { CharactersFile, Story } from "@/types/story";
import {
  CharactersFileSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MonstersFileSchema,
  StorySchema,
  type EncountersFileT,
  type ItemsFileT,
  type MonstersFileT,
} from "@/data/schemas";

import scenesData from "./scenes.json";
import charactersData from "./characters.json";
import monstersData from "./monsters.json";
import itemsData from "./items.json";
import encountersData from "./encounters.json";

/**
 * Per-story content module. Each JSON is Zod-parsed at module load so the
 * build fails fast on any drift (same fail-fast pattern the old data/*.ts
 * singletons used). The registry barrel (`src/stories/_registry.generated.ts`)
 * imports one of these namespaces per story; `lib/stories.ts` keys them by id.
 */
export const story: Story = StorySchema.parse(scenesData) as unknown as Story;
export const charactersFile: CharactersFile =
  CharactersFileSchema.parse(charactersData) as unknown as CharactersFile;
export const monstersFile: MonstersFileT = MonstersFileSchema.parse(monstersData);
export const itemsFile: ItemsFileT = ItemsFileSchema.parse(itemsData);
export const encountersFile: EncountersFileT =
  EncountersFileSchema.parse(encountersData);

/**
 * Back-compat aliases — kept so any pre-refactor import of the old named
 * exports keeps resolving. New code should go through `lib/stories.ts`.
 */
export const wizardOfOz = story;
export const wizardOfOzCharacters = charactersFile;
