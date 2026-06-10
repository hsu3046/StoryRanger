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
        // A condition item missing from the catalog can never be held → the
        // branch is permanently invisible and its subtree unreachable — the
        // worst orphan of the lot, so it must surface in the editor badge.
        for (const itemId of b.condition?.hasItems ?? []) {
          if (!known.has(itemId)) {
            missing.push({
              where: `scene:${sid}.branch:${b.id}.condition.hasItems`,
              id: itemId,
            });
          }
        }
      }
    }
  }

  // Personas whitelist the items a character may gift — an orphan here makes
  // the dialogue route silently refuse the gift (getItem → null).
  for (const c of repo.getStory(storyId)?.characters.characters ?? []) {
    for (const itemId of c.persona?.giftableItems ?? []) {
      if (!known.has(itemId)) {
        missing.push({
          where: `character:${c.id}.persona.giftableItems`,
          id: itemId,
        });
      }
    }
  }

  // Encounter rewards, trigger requirements + drops also reference the item
  // catalog.
  for (const enc of repo.listEncounters(storyId)) {
    for (const itemId of enc.rewards?.items ?? []) {
      if (!known.has(itemId)) {
        missing.push({ where: `encounter:${enc.id}.rewards.items`, id: itemId });
      }
    }
    const required = enc.trigger.requires?.item;
    if (required && !known.has(required)) {
      missing.push({
        where: `encounter:${enc.id}.trigger.requires.item`,
        id: required,
      });
    }
  }

  return { missing };
}

/** Cross-content references to UNKNOWN character ids (cast + "narrator") —
 *  drives the Characters editor's unknown-refs badge, mirroring items. */
export function scanCharacterReferences(storyId: string): {
  missing: Array<{ where: string; id: string }>;
} {
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  const missing: Array<{ where: string; id: string }> = [];
  if (!loaded) return { missing };
  const known = new Set(loaded.characters.characters.map((c) => c.id));
  known.add("narrator");
  for (const [sid, scene] of Object.entries(loaded.story.scenes)) {
    if (!known.has(scene.speaker)) {
      missing.push({ where: `scene:${sid}.speaker`, id: scene.speaker });
    }
    for (const dc of scene.dialogueCharacters ?? []) {
      if (!known.has(dc)) {
        missing.push({ where: `scene:${sid}.dialogueCharacters`, id: dc });
      }
    }
    for (const ask of scene.asks ?? []) {
      if (!known.has(ask.characterId)) {
        missing.push({
          where: `scene:${sid}.asks:${ask.id}.characterId`,
          id: ask.characterId,
        });
      }
    }
    for (const b of scene.branches) {
      if (b.outcomeSpeaker && !known.has(b.outcomeSpeaker)) {
        missing.push({
          where: `scene:${sid}.branch:${b.id}.outcomeSpeaker`,
          id: b.outcomeSpeaker,
        });
      }
    }
  }
  return { missing };
}

/** Encounter references to UNKNOWN monster ids — the Monsters editor badge. */
export function scanMonsterReferences(storyId: string): {
  missing: Array<{ where: string; id: string }>;
} {
  const repo = contentRepo();
  const known = new Set(repo.listMonsters(storyId).map((m) => m.id));
  const missing: Array<{ where: string; id: string }> = [];
  for (const enc of repo.listEncounters(storyId)) {
    for (const mid of enc.body.monsterIds) {
      if (!known.has(mid)) {
        missing.push({ where: `encounter:${enc.id}.body.monsterIds`, id: mid });
      }
    }
    for (const mid of enc.displayMonsters ?? []) {
      if (!known.has(mid)) {
        missing.push({ where: `encounter:${enc.id}.displayMonsters`, id: mid });
      }
    }
  }
  return { missing };
}

/** Locations that reference character `id` — shown in the delete confirm so
 *  the author sees what goes orphan BEFORE deleting (the runtime only
 *  degrades silently). Reads the bundled story (dev hot-reloads on save). */
export function referencesToCharacter(storyId: string, id: string): string[] {
  const story = contentRepo().getStory(storyId)?.story;
  if (!story) return [];
  const refs: string[] = [];
  for (const [sid, scene] of Object.entries(story.scenes)) {
    if (scene.speaker === id) refs.push(`scene ${sid} (speaker)`);
    if ((scene.dialogueCharacters ?? []).includes(id)) {
      refs.push(`scene ${sid} (dialogue)`);
    }
    for (const ask of scene.asks ?? []) {
      if (ask.characterId === id) refs.push(`scene ${sid} (ask ${ask.id})`);
    }
    for (const b of scene.branches) {
      if (b.outcomeSpeaker === id) {
        refs.push(`scene ${sid} (branch ${b.id} outcome voice)`);
      }
    }
  }
  return refs;
}

/** Locations that reference monster `id` — for the delete confirm. */
export function referencesToMonster(storyId: string, id: string): string[] {
  const refs: string[] = [];
  for (const enc of contentRepo().listEncounters(storyId)) {
    if (enc.body.monsterIds.includes(id)) refs.push(`encounter ${enc.id}`);
    else if ((enc.displayMonsters ?? []).includes(id)) {
      refs.push(`encounter ${enc.id} (display)`);
    }
  }
  return refs;
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
