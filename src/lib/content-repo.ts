/**
 * Content Repository — single read interface over all story content.
 *
 * Today (Phase 0) all reads come from JSON files bundled at build-time via
 * the existing import-and-validate pattern. The Repository abstraction lets
 * the admin UI (Phase 1+) call save methods that, in dev mode only, write
 * the underlying JSON files via server actions. Production stays read-only.
 *
 * Future Supabase / API backends slot in by implementing the same interface.
 */

import type {
  BackgroundMetaT,
  EncounterDefT,
  ItemDefT,
  MonsterStatsT,
} from "@/data/schemas";
import { ITEMS, listItems } from "@/data/items";
import { listBackgrounds } from "@/data/backgrounds";
import { listMonsters } from "@/data/monsters";
import { ENCOUNTERS } from "@/data/encounters";
import { getStory, listStoryIds, type LoadedStory } from "./stories";

export interface ContentRepo {
  // Story
  getStory(storyId: string): LoadedStory | null;
  listStoryIds(): string[];

  // Monsters
  listMonsters(storyId: string): MonsterStatsT[];

  // Items
  listItems(storyId: string): ItemDefT[];
  getItem(id: string): ItemDefT | null;

  // Encounters
  listEncounters(storyId: string): EncounterDefT[];

  // Backgrounds
  listBackgrounds(storyId: string): BackgroundMetaT[];
}

/**
 * Read-only repo backed by the bundled JSON files. Currently single-story
 * (wizard-of-oz). When more stories are added the helpers below can be
 * keyed by storyId.
 */
class BundledContentRepo implements ContentRepo {
  getStory(storyId: string): LoadedStory | null {
    return getStory(storyId);
  }
  listStoryIds(): string[] {
    return listStoryIds();
  }
  listMonsters(storyId: string): MonsterStatsT[] {
    void storyId; // single-story for now; param kept for the interface
    return listMonsters() as MonsterStatsT[];
  }
  listItems(storyId: string): ItemDefT[] {
    void storyId;
    return listItems();
  }
  getItem(id: string): ItemDefT | null {
    return ITEMS[id] ?? null;
  }
  listEncounters(storyId: string): EncounterDefT[] {
    void storyId;
    return ENCOUNTERS as EncounterDefT[];
  }
  listBackgrounds(storyId: string): BackgroundMetaT[] {
    void storyId;
    return listBackgrounds() as BackgroundMetaT[];
  }
}

let _repo: ContentRepo | null = null;

export function contentRepo(): ContentRepo {
  if (!_repo) _repo = new BundledContentRepo();
  return _repo;
}

/**
 * Referential-integrity scan. Reports IDs that should exist in the items
 * catalog but don't (drops / victoryItems). Used by admin to surface bad
 * data after a manual save, and at app startup as a dev-only warning.
 */
export function scanItemReferences(storyId: string): {
  missing: Array<{ where: string; id: string }>;
} {
  const repo = contentRepo();
  const known = new Set(repo.listItems(storyId).map((i) => i.id));
  const missing: Array<{ where: string; id: string }> = [];

  for (const m of repo.listMonsters(storyId)) {
    for (const drop of m.drops ?? []) {
      if (!known.has(drop)) {
        missing.push({ where: `monster:${m.id}.drops`, id: drop });
      }
    }
  }

  const story = repo.getStory(storyId)?.story;
  if (story) {
    for (const [sid, scene] of Object.entries(story.scenes)) {
      for (const itemId of scene.reward?.items ?? []) {
        if (!known.has(itemId)) {
          missing.push({ where: `scene:${sid}.reward.items`, id: itemId });
        }
      }
      for (const b of scene.branches) {
        void b; // branch.reward removed — kept loop in case future fields
        for (const itemId of [] as string[]) {
          if (!known.has(itemId)) {
            missing.push({
              where: `scene:${sid}.branch:${b.id}.reward.items`,
              id: itemId,
            });
          }
        }
      }
    }
  }

  return { missing };
}

// Dev-only startup warning — runs at module load on the server. Catches
// drops/victoryItems referencing item ids not in the catalog so the admin
// UI doesn't surprise us later.
if (typeof window === "undefined" && process.env.NODE_ENV !== "production") {
  for (const storyId of contentRepo().listStoryIds()) {
    const { missing } = scanItemReferences(storyId);
    if (missing.length > 0) {
      console.warn(
        `[content-repo] ${storyId}: ${missing.length} item references not in catalog:`,
        missing.slice(0, 5),
      );
    }
  }
}
