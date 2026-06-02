"use server";

import { revalidatePath } from "next/cache";

import {
  CharactersFileSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MedalsFileSchema,
  MonstersFileSchema,
  StorySchema,
} from "@/data/schemas";
import {
  ensureDev,
  errorMessage,
  globalPath,
  storyPath,
  writeJson,
} from "../_lib/contentFs";

/**
 * Server actions for content writes. ALL actions:
 *  1. Refuse to run in production (filesystem is read-only on Vercel
 *     anyway, but explicit refusal makes the failure mode obvious).
 *  2. Validate the incoming payload with Zod before touching disk.
 *  3. Pretty-print JSON (2-space indent) so git diffs stay clean.
 *  4. Revalidate the admin route so the next page render sees the new data.
 *
 * The path-traversal guards + JSON writer live in `../_lib/contentFs` so the
 * generation draft actions share the exact same security-sensitive code.
 */

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
    // Encounters are authored in the Story Graph (its scene/branch inspector),
    // so revalidate the graph route — the standalone Encounters page is gone.
    revalidatePath(`/admin/stories/${storyId}/graph`);
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
