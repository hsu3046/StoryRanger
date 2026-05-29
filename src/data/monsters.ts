/**
 * Monster catalog — loaded from JSON via Zod-validated content layer.
 * Keeps existing API surface (`MONSTERS`, `getMonster`, `MonsterStats`,
 * `MonsterType`) intact so call sites don't need to change.
 *
 * Image asset: /public/stories/<storyId>/monsters/<id>.{png|webp}
 */

import monstersJson from "@/stories/wizard-of-oz/monsters.json";
import { MonstersFileSchema, type MonsterStatsT } from "./schemas";
import type { PuzzleKind } from "@/lib/puzzle";
import type { SpriteSize } from "@/lib/sprite-size";

export type MonsterType = "hostile" | "neutral" | "friendly";

export interface MonsterStats {
  id: string;
  name: string;
  type: MonsterType;
  hits: number;
  drops?: string[];
  size: SpriteSize;
  puzzleKind?: PuzzleKind | "random";
  airborne?: boolean;
  notes?: string;
  /** Optional sprite path override (extensionless base). */
  image?: string;
}

// Validate on module load — fail fast with a clear error if JSON drifts.
const parsed = MonstersFileSchema.parse(monstersJson);

export const MONSTERS: Record<string, MonsterStats> = Object.fromEntries(
  parsed.monsters.map((m: MonsterStatsT) => [m.id, m as MonsterStats]),
);

export function getMonster(id: string): MonsterStats | null {
  return MONSTERS[id] ?? null;
}

export function listMonsters(): MonsterStats[] {
  return parsed.monsters as MonsterStats[];
}
