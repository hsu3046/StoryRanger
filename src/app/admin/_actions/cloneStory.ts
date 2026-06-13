"use server";

import { promises as fs } from "node:fs";
import { revalidatePath } from "next/cache";

import {
  CharactersFileSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MonstersFileSchema,
  StorySchema,
} from "@/data/schemas";
import {
  STORY_ID_RE,
  ensureDev,
  errorMessage,
  storyDir,
  storyPath,
  writeJson,
} from "../_lib/contentFs";
import {
  regenerateRegistry,
  storyIndexSource,
} from "../_lib/regenerateRegistry";

/**
 * Clone a committed story — the "re-author for a different age / extend into
 * a new story" workflow. Copies the five content JSONs (a few KB) and NOT a
 * single asset byte: the clone's `assetStoryId` points derived asset paths
 * (sprites/portraits/BGM/map/monsters) at the SOURCE story's media, and the
 * stored paths inside the copied JSONs (scene.image, coverImage, `image`
 * overrides) already carry the source's folder. Divergence is per-asset:
 * regenerating a scene image for the clone writes into the clone's own
 * folder and updates that one stored path.
 *
 * Dev-only, like every admin content write. Drafts (draft.*.json) are NOT
 * copied — a clone starts as a committed, playable story.
 */
export async function cloneStoryAction(input: {
  sourceId: string;
  /** Free-form new id; empty → `<sourceId>-copy`, deduped with -2, -3… */
  newId?: string;
  /** New title; empty → `<source title> (Copy)`. */
  newTitle?: string;
}): Promise<
  { ok: true; storyId: string } | { ok: false; error: string }
> {
  try {
    ensureDev();
    const sourceId = input.sourceId.trim();
    if (!STORY_ID_RE.test(sourceId)) {
      return { ok: false, error: `Invalid source id: ${sourceId}` };
    }
    // Only committed stories clone — a half-finished draft has no scenes.json.
    await fs.access(storyPath(sourceId, "index.ts")).catch(() => {
      throw new Error(`"${sourceId}" is not a committed story.`);
    });

    const newId = (input.newId?.trim() || (await defaultCloneId(sourceId)))
      .toLowerCase();
    if (!STORY_ID_RE.test(newId)) {
      return {
        ok: false,
        error: `Invalid id "${newId}" — lowercase letters, digits, "-", "_" only.`,
      };
    }
    if (newId === sourceId) {
      return { ok: false, error: "New id must differ from the source id." };
    }
    const targetDir = storyDir(newId);
    const exists = await fs.access(targetDir).then(
      () => true,
      () => false,
    );
    if (exists) {
      return { ok: false, error: `"${newId}" already exists.` };
    }

    // scenes.json — the only file that changes: new id/title, and the asset
    // indirection. Chain-flattening matters: cloning a CLONE keeps pointing
    // at the ORIGINAL media owner, so deleting an intermediate clone can
    // never strand grandchildren.
    const source = StorySchema.parse(
      JSON.parse(await fs.readFile(storyPath(sourceId, "scenes.json"), "utf-8")),
    );
    const cloned = {
      ...source,
      id: newId,
      title: input.newTitle?.trim() || `${source.title} (Copy)`,
      assetStoryId: source.assetStoryId ?? sourceId,
    };
    await writeJson(StorySchema, storyPath(newId, "scenes.json"), cloned);

    // The other four copy verbatim (validated on the way through).
    await copyValidated(CharactersFileSchema, sourceId, newId, "characters.json");
    await copyValidated(MonstersFileSchema, sourceId, newId, "monsters.json");
    await copyValidated(ItemsFileSchema, sourceId, newId, "items.json");
    await copyValidated(EncountersFileSchema, sourceId, newId, "encounters.json");

    await fs.writeFile(storyPath(newId, "index.ts"), storyIndexSource(), "utf-8");
    await regenerateRegistry();

    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, storyId: newId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Read a source content file, validate, and write it under the clone. */
async function copyValidated<T>(
  schema: Parameters<typeof writeJson<T>>[0],
  sourceId: string,
  newId: string,
  filename: string,
): Promise<void> {
  const data = JSON.parse(
    await fs.readFile(storyPath(sourceId, filename), "utf-8"),
  );
  await writeJson(schema, storyPath(newId, filename), data);
}

/** `<sourceId>-copy`, then `-copy2`, `-copy3`… until free. */
async function defaultCloneId(sourceId: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? `${sourceId}-copy` : `${sourceId}-copy${n}`;
    const taken = await fs.access(storyDir(candidate)).then(
      () => true,
      () => false,
    );
    if (!taken) return candidate;
  }
  throw new Error("Could not find a free clone id (100 tries).");
}
