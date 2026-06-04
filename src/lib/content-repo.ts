/**
 * Content Repository — single read interface over all story content.
 *
 * All reads come from JSON files bundled at build-time via the per-story
 * content modules (`src/stories/<id>/index.ts`), surfaced through `getStory`.
 * The admin UI (dev mode only) writes the underlying JSON files via server
 * actions; production stays read-only.
 *
 * Future Supabase / API backends slot in by implementing the same interface.
 */

import type {
  EncounterDefT,
  ItemDefT,
  MonsterStatsT,
} from "@/data/schemas";
import { getStory, listStoryIds, type LoadedStory } from "./stories";
import { normalizeDrop } from "@/data/monsters";

export interface ContentRepo {
  // Story
  getStory(storyId: string): LoadedStory | null;
  listStoryIds(): string[];

  // Monsters
  listMonsters(storyId: string): MonsterStatsT[];

  // Items
  listItems(storyId: string): ItemDefT[];
  getItem(storyId: string, id: string): ItemDefT | null;

  // Encounters
  listEncounters(storyId: string): EncounterDefT[];
}

/**
 * Read-only repo backed by the bundled per-story JSON modules. Everything is
 * keyed by storyId off the loaded story.
 */
class BundledContentRepo implements ContentRepo {
  getStory(storyId: string): LoadedStory | null {
    return getStory(storyId);
  }
  listStoryIds(): string[] {
    return listStoryIds();
  }
  listMonsters(storyId: string): MonsterStatsT[] {
    return getStory(storyId)?.monsters.monsters ?? [];
  }
  listItems(storyId: string): ItemDefT[] {
    return getStory(storyId)?.items.items ?? [];
  }
  getItem(storyId: string, id: string): ItemDefT | null {
    return getStory(storyId)?.items.items.find((it) => it.id === id) ?? null;
  }
  listEncounters(storyId: string): EncounterDefT[] {
    return getStory(storyId)?.encounters.encounters ?? [];
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
    for (const d of m.drops ?? []) {
      const item = normalizeDrop(d).item;
      if (!known.has(item)) {
        missing.push({ where: `monster:${m.id}.drops`, id: item });
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

  // Encounter rewards + drops also reference the item catalog.
  for (const enc of repo.listEncounters(storyId)) {
    for (const itemId of enc.rewards?.items ?? []) {
      if (!known.has(itemId)) {
        missing.push({ where: `encounter:${enc.id}.rewards.items`, id: itemId });
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
