"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { ZodType } from "zod";

import {
  BackgroundsFileSchema,
  CharactersFileSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MedalsFileSchema,
  MonstersFileSchema,
  PuzzleRoutingSchema,
  StorySchema,
} from "@/data/schemas";

/**
 * Server actions for content writes. ALL actions:
 *  1. Refuse to run in production (filesystem is read-only on Vercel
 *     anyway, but explicit refusal makes the failure mode obvious).
 *  2. Validate the incoming payload with Zod before touching disk.
 *  3. Pretty-print JSON (2-space indent) so git diffs stay clean.
 *  4. Revalidate the admin route so the next page render sees the new data.
 */

function ensureDev(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Admin writes are disabled in production builds.");
  }
}

// Safe id / filename character sets. Reject `..`, slashes, NUL, etc.
const STORY_ID_RE = /^[a-z0-9_-]+$/i;
const FILENAME_RE = /^[a-z0-9_.-]+$/i;

/**
 * Build the JSON destination path for a story file, with two safety nets:
 *  1. Strict regex on storyId + filename so traversal sequences are
 *     rejected before they ever reach `path.resolve`.
 *  2. After resolution, verify the resulting path stays under
 *     `<cwd>/src/stories/` — defense in depth against any encoding bypass.
 */
function storyPath(storyId: string, filename: string): string {
  if (!STORY_ID_RE.test(storyId)) {
    throw new Error(`Invalid storyId: ${JSON.stringify(storyId)}`);
  }
  if (!FILENAME_RE.test(filename)) {
    throw new Error(`Invalid filename: ${JSON.stringify(filename)}`);
  }
  const root = path.resolve(process.cwd(), "src", "stories");
  const resolved = path.resolve(root, storyId, filename);
  // Must stay strictly INSIDE the stories root.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes stories root");
  }
  return resolved;
}

/**
 * Build a JSON destination path for a GLOBAL (cross-story) content file
 * under `<cwd>/src/data/global/`. Same traversal safety as `storyPath`.
 */
function globalPath(filename: string): string {
  if (!FILENAME_RE.test(filename)) {
    throw new Error(`Invalid filename: ${JSON.stringify(filename)}`);
  }
  const root = path.resolve(process.cwd(), "src", "data", "global");
  const resolved = path.resolve(root, filename);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes global data root");
  }
  return resolved;
}

async function writeJson<T>(
  schema: ZodType<T>,
  filePath: string,
  data: unknown,
): Promise<void> {
  const parsed = schema.parse(data);
  const json = `${JSON.stringify(parsed, null, 2)}\n`;
  await fs.writeFile(filePath, json, "utf-8");
}

export async function saveMonstersAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(MonstersFileSchema, storyPath(storyId, "monsters.json"), payload);
    revalidatePath(`/admin/stories/${storyId}/monsters`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveItemsAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(ItemsFileSchema, storyPath(storyId, "items.json"), payload);
    revalidatePath(`/admin/stories/${storyId}/items`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveCharactersAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(CharactersFileSchema, storyPath(storyId, "characters.json"), payload);
    revalidatePath(`/admin/stories/${storyId}/characters`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Medals are a GLOBAL achievement catalog — written to
 * src/data/global/medals.json, no storyId.
 */
export async function saveMedalsAction(
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(MedalsFileSchema, globalPath("medals.json"), payload);
    revalidatePath(`/admin/medals`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveEncountersAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(EncountersFileSchema, storyPath(storyId, "encounters.json"), payload);
    revalidatePath(`/admin/stories/${storyId}/encounters`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveBackgroundsAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(BackgroundsFileSchema, storyPath(storyId, "backgrounds.json"), payload);
    revalidatePath(`/admin/stories/${storyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Puzzle routing is GLOBAL (shared across all stories) — written to
 * src/data/global/puzzle-routing.json, no storyId.
 */
export async function savePuzzleRoutingAction(
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(
      PuzzleRoutingSchema,
      globalPath("puzzle-routing.json"),
      payload,
    );
    revalidatePath(`/admin/puzzles`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveScenesAction(
  storyId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  ensureDev();
  try {
    await writeJson(StorySchema, storyPath(storyId, "scenes.json"), payload);
    revalidatePath(`/admin/stories/${storyId}/graph`);
    revalidatePath(`/play/${storyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
