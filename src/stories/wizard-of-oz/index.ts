import type { CharactersFile, Story } from "@/types/story";

import scenesData from "./scenes.json";
import charactersData from "./characters.json";

export const wizardOfOz: Story = scenesData as unknown as Story;
export const wizardOfOzCharacters: CharactersFile =
  charactersData as unknown as CharactersFile;
