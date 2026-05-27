import type {
  CharactersFile,
  MedalsFile,
  Story,
} from "@/types/story";

import {
  wizardOfOz,
  wizardOfOzCharacters,
  wizardOfOzMedals,
} from "@/stories/wizard-of-oz";

export interface LoadedStory {
  story: Story;
  medals: MedalsFile;
  characters: CharactersFile;
}

const REGISTRY: Record<string, LoadedStory> = {
  "wizard-of-oz": {
    story: wizardOfOz,
    medals: wizardOfOzMedals,
    characters: wizardOfOzCharacters,
  },
};

export function getStory(storyId: string): LoadedStory | null {
  return REGISTRY[storyId] ?? null;
}

export function listStoryIds(): string[] {
  return Object.keys(REGISTRY);
}
