/**
 * Monster catalog — read per-story from the loaded story module.
 *
 * Previously a single hardcoded wizard-of-oz global (`MONSTERS`); now keyed by
 * storyId via `getStory`, so each story has its own monster roster. Call sites
 * pass the storyId they already have in scope.
 *
 * Image asset: /public/stories/<storyId>/monsters/<id>.{png|webp}
 */

import { getStory } from "@/lib/stories";
import type { MonsterStatsT } from "./schemas";
import type { SpriteSize } from "@/lib/sprite-size";

export type MonsterType = "hostile" | "neutral" | "friendly";

export interface MonsterStats {
  id: string;
  name: string;
  type: MonsterType;
  hits: number;
  drops?: string[];
  size: SpriteSize;
  airborne?: boolean;
  notes?: string;
  /** Optional sprite path override (extensionless base). */
  image?: string;
}

/** Lookup map (id → stats) for a story. Cheap to rebuild; the underlying
 *  catalog is a small build-time-bundled array. */
export function monstersFor(storyId: string): Record<string, MonsterStats> {
  const list = (getStory(storyId)?.monsters.monsters ?? []) as MonsterStatsT[];
  return Object.fromEntries(list.map((m) => [m.id, m as MonsterStats]));
}

export function getMonster(storyId: string, id: string): MonsterStats | null {
  return monstersFor(storyId)[id] ?? null;
}

export function listMonsters(storyId: string): MonsterStats[] {
  return (getStory(storyId)?.monsters.monsters ?? []) as MonsterStats[];
}
