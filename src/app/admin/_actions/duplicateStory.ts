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
  publicStoryDir,
  storyDir,
  storyPath,
  writeJson,
} from "../_lib/contentFs";
import {
  regenerateRegistry,
  storyIndexSource,
} from "../_lib/regenerateRegistry";

/**
 * Duplicate a committed story — the "re-author for a different age / extend into
 * a new story" workflow. Copies the five content JSONs (a few KB) and NOT a
 * single asset byte: the duplicate's `assetStoryId` points derived asset paths
 * (sprites/portraits/BGM/map/monsters) at the SOURCE story's media, and the
 * stored paths inside the copied JSONs (scene.image, coverImage, `image`
 * overrides) already carry the source's folder. Divergence is per-asset:
 * regenerating a scene image for the duplicate writes into the duplicate's own
 * folder and updates that one stored path.
 *
 * Dev-only, like every admin content write. Drafts (draft.*.json) are NOT
 * copied — a duplicate starts as a committed, playable story.
 */
export async function duplicateStoryAction(input: {
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
    // Only committed stories duplicate — a half-finished draft has no scenes.json.
    await fs.access(storyPath(sourceId, "index.ts")).catch(() => {
      throw new Error(`"${sourceId}" is not a committed story.`);
    });

    const newId = (input.newId?.trim() || (await defaultDuplicateId(sourceId)))
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

    const sourceRaw = await fs.readFile(
      storyPath(sourceId, "scenes.json"),
      "utf-8",
    );
    const source = StorySchema.parse(JSON.parse(sourceRaw));

    // Duplicating a DUPLICATE (Codex P2): the intermediate may have DIVERGED
    // assets — stored paths under its own `/stories/<sourceId>/…` (a
    // regenerated scene image, a character override). Copying those paths
    // verbatim would leave the grandchild depending on the intermediate's
    // folder, contradicting the chain-flattening promise ("intermediates are
    // deletable"). So: rewrite those paths to OUR folder + copy the
    // intermediate's public folder (it holds ONLY its diverged media — the
    // zero-copy design keeps it small). Original-owner paths pass through
    // untouched. Duplicating an ORIGINAL never copies (its folder is the
    // full asset set; assetStoryId covers it).
    const sourceIsDuplicate = !!source.assetStoryId;
    const rewriteDivergedPaths = (raw: string): string =>
      sourceIsDuplicate
        ? raw.replaceAll(`/stories/${sourceId}/`, `/stories/${newId}/`)
        : raw;
    if (sourceIsDuplicate) {
      const srcPublic = publicStoryDir(sourceId);
      const hasPublic = await fs.access(srcPublic).then(
        () => true,
        () => false,
      );
      if (hasPublic) {
        await fs.cp(srcPublic, publicStoryDir(newId), { recursive: true });
      }
    }

    // scenes.json — the only file that changes shape: new id/title + the
    // asset indirection. Chain-flattening: the new duplicate points at the
    // ORIGINAL media owner (with the intermediate's divergence propagated
    // above), so deleting an intermediate can never strand grandchildren.
    const duplicated = {
      ...StorySchema.parse(JSON.parse(rewriteDivergedPaths(sourceRaw))),
      id: newId,
      title: input.newTitle?.trim() || `${source.title} (Copy)`,
      assetStoryId: source.assetStoryId ?? sourceId,
    };
    await writeJson(StorySchema, storyPath(newId, "scenes.json"), duplicated);

    // The other four copy verbatim (validated on the way through; diverged
    // intermediate paths rewritten the same way).
    await copyValidated(CharactersFileSchema, sourceId, newId, "characters.json", rewriteDivergedPaths);
    await copyValidated(MonstersFileSchema, sourceId, newId, "monsters.json", rewriteDivergedPaths);
    await copyValidated(ItemsFileSchema, sourceId, newId, "items.json", rewriteDivergedPaths);
    await copyValidated(EncountersFileSchema, sourceId, newId, "encounters.json", rewriteDivergedPaths);

    await fs.writeFile(storyPath(newId, "index.ts"), storyIndexSource(), "utf-8");
    await regenerateRegistry();

    revalidatePath("/admin");
    revalidatePath("/");
    return { ok: true, storyId: newId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Read a source content file, validate, and write it under the duplicate.
 *  `rewrite` runs on the RAW text first (diverged-path propagation). */
async function copyValidated<T>(
  schema: Parameters<typeof writeJson<T>>[0],
  sourceId: string,
  newId: string,
  filename: string,
  rewrite: (raw: string) => string = (raw) => raw,
): Promise<void> {
  const data = JSON.parse(
    rewrite(await fs.readFile(storyPath(sourceId, filename), "utf-8")),
  );
  await writeJson(schema, storyPath(newId, filename), data);
}

/** `<sourceId>-copy`, then `-copy2`, `-copy3`… until free. */
async function defaultDuplicateId(sourceId: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? `${sourceId}-copy` : `${sourceId}-copy${n}`;
    const taken = await fs.access(storyDir(candidate)).then(
      () => true,
      () => false,
    );
    if (!taken) return candidate;
  }
  throw new Error("Could not find a free duplicate id (100 tries).");
}
