/**
 * Full referential-integrity validation for a story dir, read straight from
 * disk (`src/stories/<id>/*.json`). Works for BOTH unregistered drafts and
 * registered stories — the JSON on disk is the source of truth — so the
 * generation wizard can validate a draft before committing it to the registry.
 *
 * Server-only (uses node:fs). Dev-only in practice (admin tooling).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CharactersFileSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MonstersFileSchema,
  StorySchema,
} from "@/data/schemas";
import { storyDir } from "./contentFs";
import { normalizeDrop } from "@/data/monsters";

export interface ValidationIssue {
  where: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Engine-reserved companion slot ids (see CompanionIdSchema / story types). */
const COMPANION_SLOTS = new Set(["scarecrow", "tinman", "lion"]);

async function readJsonFile(dir: string, name: string): Promise<unknown> {
  const raw = await fs.readFile(path.join(dir, name), "utf-8");
  return JSON.parse(raw) as unknown;
}

export async function validateStory(
  storyId: string,
): Promise<ValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const dir = storyDir(storyId);

  // ── 1. Schema parse all 5 files ────────────────────────────────
  const story = await parseFile(dir, "scenes.json", StorySchema, errors);
  const charsFile = await parseFile(
    dir,
    "characters.json",
    CharactersFileSchema,
    errors,
  );
  const monstersFile = await parseFile(
    dir,
    "monsters.json",
    MonstersFileSchema,
    errors,
  );
  const itemsFile = await parseFile(dir, "items.json", ItemsFileSchema, errors);
  const encFile = await parseFile(
    dir,
    "encounters.json",
    EncountersFileSchema,
    errors,
  );

  // If the spine files failed to parse, there's nothing to cross-reference.
  if (!story || !charsFile) {
    return { ok: errors.length === 0, errors, warnings };
  }

  const sceneIds = new Set(Object.keys(story.scenes));
  const characterIds = new Set(charsFile.characters.map((c) => c.id));
  // "narrator" is always an allowed speaker even if not in the cast.
  characterIds.add("narrator");
  const itemIds = new Set((itemsFile?.items ?? []).map((i) => i.id));
  const monsterIds = new Set((monstersFile?.monsters ?? []).map((m) => m.id));
  // Keywords are ONLY produced by ask unlocks (Scene.asks[].unlock.keyword) —
  // a branch gated on a keyword no ask defines can never appear. Collected
  // across the WHOLE story first, since an unlock earned in one scene can
  // gate a branch in any other.
  const definedKeywords = new Set(
    Object.values(story.scenes).flatMap((s) =>
      (s.asks ?? []).flatMap((a) => (a.unlock ? [a.unlock.keyword] : [])),
    ),
  );

  // ── 2. Hero existence + uniqueness ─────────────────────────────
  const heroes = charsFile.characters.filter((c) => c.isHero);
  if (heroes.length === 0) {
    errors.push({
      where: "characters",
      message: "no isHero character (the engine requires exactly one)",
    });
  } else if (heroes.length > 1) {
    errors.push({
      where: "characters",
      message: `more than one isHero character (${heroes.map((h) => h.id).join(", ")})`,
    });
  }

  // ── 3. Scene graph integrity ───────────────────────────────────
  if (!sceneIds.has(story.startScene)) {
    errors.push({
      where: "story.startScene",
      message: `startScene "${story.startScene}" is not a scene id`,
    });
  }

  for (const [sid, scene] of Object.entries(story.scenes)) {
    if (!characterIds.has(scene.speaker)) {
      errors.push({
        where: `scene:${sid}.speaker`,
        message: `speaker "${scene.speaker}" is not a character`,
      });
    }
    for (const dc of scene.dialogueCharacters ?? []) {
      if (!characterIds.has(dc)) {
        errors.push({
          where: `scene:${sid}.dialogueCharacters`,
          message: `"${dc}" is not a character`,
        });
      }
    }
    for (const ask of scene.asks ?? []) {
      if (!characterIds.has(ask.characterId)) {
        errors.push({
          where: `scene:${sid}.asks:${ask.id}.characterId`,
          message: `"${ask.characterId}" is not a character`,
        });
      }
    }
    for (const itemId of scene.reward?.items ?? []) {
      if (!itemIds.has(itemId)) {
        errors.push({
          where: `scene:${sid}.reward.items`,
          message: `item "${itemId}" is not in the items catalog`,
        });
      }
    }
    for (const mb of scene.reward?.moodBoost ?? []) {
      if (!COMPANION_SLOTS.has(mb.companionId)) {
        errors.push({
          where: `scene:${sid}.reward.moodBoost`,
          message: `companion "${mb.companionId}" is not a valid slot`,
        });
      }
    }
    const seenBranch = new Set<string>();
    for (const b of scene.branches) {
      if (seenBranch.has(b.id)) {
        errors.push({
          where: `scene:${sid}.branch:${b.id}`,
          message: `duplicate branch id "${b.id}"`,
        });
      }
      seenBranch.add(b.id);
      if (!sceneIds.has(b.next)) {
        errors.push({
          where: `scene:${sid}.branch:${b.id}.next`,
          message: `next "${b.next}" is not a scene id`,
        });
      }
      // outcomeSpeaker picks a TTS voice exactly like scene.speaker — hold it
      // to the same standard (a deleted character would otherwise silently
      // fall back at runtime while scene.speaker errors).
      if (b.outcomeSpeaker && !characterIds.has(b.outcomeSpeaker)) {
        errors.push({
          where: `scene:${sid}.branch:${b.id}.outcomeSpeaker`,
          message: `outcomeSpeaker "${b.outcomeSpeaker}" is not a character`,
        });
      }
      // A condition item missing from the catalog can never be held → the
      // branch is permanently invisible and its subtree unreachable.
      for (const itemId of b.condition?.hasItems ?? []) {
        if (!itemIds.has(itemId)) {
          errors.push({
            where: `scene:${sid}.branch:${b.id}.condition.hasItems`,
            message: `item "${itemId}" is not in the items catalog`,
          });
        }
      }
      // Warning (not error): the keyword may legitimately be authored before
      // its ask exists, but shipping it means the branch can never appear.
      for (const k of b.condition?.hasKeywords ?? []) {
        if (!definedKeywords.has(k)) {
          warnings.push({
            where: `scene:${sid}.branch:${b.id}.condition.hasKeywords`,
            message: `keyword "${k}" is never unlocked by any ask — branch can't appear`,
          });
        }
      }
    }
    if (scene.branches.length === 0 && !scene.ending) {
      warnings.push({
        where: `scene:${sid}`,
        message: "dead-end scene with no branches and no ending tag",
      });
    }
    if (!scene.image || scene.image.trim() === "") {
      warnings.push({ where: `scene:${sid}.image`, message: "no image set" });
    }
  }

  // ── 4. Monster drops reference real items ──────────────────────
  for (const m of monstersFile?.monsters ?? []) {
    for (const d of m.drops ?? []) {
      const item = normalizeDrop(d).item;
      if (!itemIds.has(item)) {
        errors.push({
          where: `monster:${m.id}.drops`,
          message: `item "${item}" is not in the items catalog`,
        });
      }
    }
  }

  // ── 5. Encounter integrity ─────────────────────────────────────
  for (const enc of encFile?.encounters ?? []) {
    const { sceneId, branchId, requires } = enc.trigger;
    const scene = story.scenes[sceneId];
    if (!scene) {
      errors.push({
        where: `encounter:${enc.id}.trigger.sceneId`,
        message: `"${sceneId}" is not a scene id`,
      });
    } else if (!scene.branches.some((b) => b.id === branchId)) {
      errors.push({
        where: `encounter:${enc.id}.trigger.branchId`,
        message: `"${branchId}" is not a branch of scene "${sceneId}"`,
      });
    }
    if (requires?.companion && !COMPANION_SLOTS.has(requires.companion)) {
      errors.push({
        where: `encounter:${enc.id}.trigger.requires.companion`,
        message: `companion "${requires.companion}" is not a valid slot`,
      });
    }
    if (requires?.item && !itemIds.has(requires.item)) {
      errors.push({
        where: `encounter:${enc.id}.trigger.requires.item`,
        message: `item "${requires.item}" is not in the items catalog`,
      });
    }
    for (const mid of [
      ...enc.body.monsterIds,
      ...(enc.displayMonsters ?? []),
    ]) {
      if (!monsterIds.has(mid)) {
        errors.push({
          where: `encounter:${enc.id}.monsters`,
          message: `monster "${mid}" is not in the monsters catalog`,
        });
      }
    }
    for (const itemId of enc.rewards?.items ?? []) {
      if (!itemIds.has(itemId)) {
        errors.push({
          where: `encounter:${enc.id}.rewards.items`,
          message: `item "${itemId}" is not in the items catalog`,
        });
      }
    }
  }

  // ── 6. Cover image (required for the home card) ─────────────────
  const coverPresent = await anyAssetExists(storyId, story.coverImage);
  if (!coverPresent) {
    warnings.push({
      where: "story.coverImage",
      message: `cover not found on disk (${story.coverImage})`,
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Read + Zod-parse a story file; pushes an error and returns null on failure. */
async function parseFile<T>(
  dir: string,
  name: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
  errors: ValidationIssue[],
): Promise<T | null> {
  let raw: unknown;
  try {
    raw = await readJsonFile(dir, name);
  } catch (err) {
    errors.push({
      where: name,
      message: `unreadable: ${err instanceof Error ? err.message : String(err)}`,
    });
    return null;
  }
  const res = schema.safeParse(raw);
  if (!res.success) {
    errors.push({
      where: name,
      message: `schema validation failed: ${JSON.stringify(res.error).slice(0, 300)}`,
    });
    return null;
  }
  return res.data ?? null;
}

/** True if any extension variant of an extensionless `/stories/<id>/...` web
 *  path exists under `public/`. */
async function anyAssetExists(
  storyId: string,
  webPath: string,
): Promise<boolean> {
  void storyId;
  if (!webPath) return false;
  // Constrain the probe to public/ — coverImage is an unbounded z.string().
  const root = path.resolve(process.cwd(), "public");
  const base = path.resolve(root, webPath.replace(/^\/+/, ""));
  if (base !== root && !base.startsWith(root + path.sep)) return false;
  for (const ext of [".webp", ".png", ".jpeg", ".jpg"]) {
    try {
      await fs.access(base + ext);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}
