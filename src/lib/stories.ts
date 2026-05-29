import type { CharactersFile, Story } from "@/types/story";

import { wizardOfOz, wizardOfOzCharacters } from "@/stories/wizard-of-oz";

export interface LoadedStory {
  story: Story;
  characters: CharactersFile;
}

const REGISTRY: Record<string, LoadedStory> = {
  "wizard-of-oz": {
    story: wizardOfOz,
    characters: wizardOfOzCharacters,
  },
};

export function getStory(storyId: string): LoadedStory | null {
  return REGISTRY[storyId] ?? null;
}

export function listStoryIds(): string[] {
  return Object.keys(REGISTRY);
}
