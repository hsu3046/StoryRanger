import type {
  CharactersFile,
  MedalsFile,
  Story,
} from "@/types/story";

import scenesData from "./scenes.json";
import medalsData from "./medals.json";
import charactersData from "./characters.json";

export const wizardOfOz: Story = scenesData as unknown as Story;
export const wizardOfOzMedals: MedalsFile = medalsData as unknown as MedalsFile;
export const wizardOfOzCharacters: CharactersFile =
  charactersData as unknown as CharactersFile;
