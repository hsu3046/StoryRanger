"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";

import {
  CharacterArtFileSchema,
  CharactersFileSchema,
  ConceptSchema,
  DraftMetaSchema,
  DraftSceneMetaSchema,
  EncountersFileSchema,
  ItemsFileSchema,
  MonstersFileSchema,
  StorySchema,
  StoryboardSchema,
} from "@/data/schemas";
import type { CharactersFile, Story } from "@/types/story";
import { getStory } from "@/lib/stories";
import { slugify } from "../_lib/slugify";
import {
  ensureDev,
  errorMessage,
  publicStoryDir,
  storyDir,
  storyPath,
  STORY_ID_RE,
  writeJson,
} from "../_lib/contentFs";
import { regenerateRegistry, storyIndexSource } from "../_lib/regenerateRegistry";
import { validateStory, type ValidationIssue } from "../_lib/validateStory";
import { readDraftMeta, DRAFT_FILES } from "../_lib/draftStore";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// Default ElevenLabs voices for placeholder characters (real ids from
// src/data/global/voices.json). The characters stage / admin re-picks them.
const DEFAULT_NARRATOR_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Storyteller
const DEFAULT_HERO_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Young Hero

const PUBLIC_SUBDIRS = [
  "scenes",
  "backgrounds",
  "characters",
  "characters/battle",
  "dialogue",
  "monsters",
  "audio/bgm",
  "map",
];

function nowIso(): string {
  return new Date().toISOString();
}

function placeholderStory(id: string, title: string, language: string): Story {
  return {
    id,
    title,
    language,
    estimatedMinutes: 10,
    coverImage: `/stories/${id}/cover`,
    startScene: "s1",
    scenes: {
      s1: {
        image: "",
        bgm: "",
        speaker: "narrator",
        narration: "",
        branches: [],
      },
    },
  };
}

function placeholderCharacters(): CharactersFile {
  return {
    characters: [
      {
        id: "narrator",
        name: "Narrator",
        gender: "neutral",
        voice: DEFAULT_NARRATOR_VOICE,
        voiceSpeed: 1,
        color: "#6b7280",
        size: "medium",
      },
      {
        id: "hero",
        name: "Hero",
        isHero: true,
        gender: "neutral",
        voice: DEFAULT_HERO_VOICE,
        voiceSpeed: 1,
        color: "#c9a23a",
        size: "medium",
      },
    ],
  };
}

/**
 * Scaffold a new draft story dir (src + public). Does NOT register it in the
 * barrel — a draft stays invisible to the player/registry until committed.
 */
export async function createDraftAction(input: {
  title: string;
  language: string;
  brief: string;
}): Promise<ActionResult<{ storyId: string }>> {
  ensureDev();
  try {
    const title = input.title.trim();
    if (!title) return { ok: false, error: "Title is required." };
    const storyId = slugify(title);
    if (!storyId || !STORY_ID_RE.test(storyId)) {
      return { ok: false, error: `Could not derive a valid id from "${title}".` };
    }
    // Reject collisions with a registered story or an existing dir.
    if (getStory(storyId)) {
      return { ok: false, error: `A story "${storyId}" already exists.` };
    }
    try {
      await fs.access(storyDir(storyId));
      return { ok: false, error: `A draft dir "${storyId}" already exists.` };
    } catch {
      /* good — does not exist */
    }

    // Source content (minimal valid spine + empty catalogs).
    await writeJson(StorySchema, storyPath(storyId, "scenes.json"), placeholderStory(storyId, title, input.language));
    await writeJson(CharactersFileSchema, storyPath(storyId, "characters.json"), placeholderCharacters());
    await writeJson(ItemsFileSchema, storyPath(storyId, "items.json"), { items: [] });
    await writeJson(MonstersFileSchema, storyPath(storyId, "monsters.json"), { monsters: [] });
    await writeJson(EncountersFileSchema, storyPath(storyId, "encounters.json"), { encounters: [] });

    // Draft control state.
    await writeJson(DraftMetaSchema, storyPath(storyId, DRAFT_FILES.meta), {
      storyId,
      status: "drafting",
      currentStage: "concept",
      stageStatuses: {},
      brief: input.brief ?? "",
      language: input.language,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      itemProgress: {
        narration: { done: [], failed: [] },
        images: { done: [], failed: [] },
      },
    });

    // Public asset dirs.
    const pub = publicStoryDir(storyId);
    for (const sub of PUBLIC_SUBDIRS) {
      await fs.mkdir(path.join(pub, ...sub.split("/")), { recursive: true });
    }

    revalidatePath("/admin/generate");
    return { ok: true, storyId };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ── Per-stage artifact saves (validated; written to the draft dir) ──

// Per-draft serialization for meta read-merge-write. Without it, two
// overlapping partial saves read the same base and the later write reverts the
// other's field (e.g. a brief save finishing after a currentStage save). Each
// save waits for the prior save of the SAME draft, so the merge always reads
// the latest on-disk meta. (Dev-only single-process; in-memory chain suffices.)
const metaWriteChains = new Map<string, Promise<unknown>>();

/**
 * Merge a partial meta patch into the current on-disk meta, serialized per
 * draft. Callers pass only the field(s) they own (e.g. `{ currentStage }` or
 * `{ brief }`) so different steps don't clobber each other's fields.
 */
export async function saveDraftMetaAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  const prev = metaWriteChains.get(storyId) ?? Promise.resolve();
  const task = prev.then(async () => {
    const cur = await readDraftMeta(storyId);
    const merged =
      payload && typeof payload === "object"
        ? { ...(cur ?? {}), ...(payload as Record<string, unknown>), storyId, updatedAt: nowIso() }
        : payload;
    await writeJson(DraftMetaSchema, storyPath(storyId, DRAFT_FILES.meta), merged);
    revalidatePath(`/admin/generate/${storyId}`);
  });
  metaWriteChains.set(storyId, task.catch(() => {}));
  try {
    await task;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveConceptAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(ConceptSchema, storyPath(storyId, DRAFT_FILES.concept), payload);
    revalidatePath(`/admin/generate/${storyId}/concept`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveStoryboardAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(StoryboardSchema, storyPath(storyId, DRAFT_FILES.storyboard), payload);
    revalidatePath(`/admin/generate/${storyId}/storyboard`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveCharacterArtAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(CharacterArtFileSchema, storyPath(storyId, DRAFT_FILES.characterArt), payload);
    revalidatePath(`/admin/generate/${storyId}/characters`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveDraftCharactersAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(CharactersFileSchema, storyPath(storyId, "characters.json"), payload);
    revalidatePath(`/admin/generate/${storyId}/characters`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveDraftScenesAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(StorySchema, storyPath(storyId, "scenes.json"), payload);
    revalidatePath(`/admin/generate/${storyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveDraftSceneMetaAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(DraftSceneMetaSchema, storyPath(storyId, DRAFT_FILES.sceneMeta), payload);
    revalidatePath(`/admin/generate/${storyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function saveDraftItemsAction(
  storyId: string,
  payload: unknown,
): Promise<ActionResult> {
  ensureDev();
  try {
    await writeJson(ItemsFileSchema, storyPath(storyId, "items.json"), payload);
    revalidatePath(`/admin/generate/${storyId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ── Validate / commit / discard ────────────────────────────────

export async function validateDraftAction(
  storyId: string,
): Promise<ActionResult<{ errors: ValidationIssue[]; warnings: ValidationIssue[] }>> {
  ensureDev();
  try {
    const res = await validateStory(storyId);
    return { ok: true, errors: res.errors, warnings: res.warnings };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Commit a draft: validate, write its `index.ts`, regenerate the registry
 * barrel, and mark it committed. After this the story is registered and plays
 * at /play/<id>. Blocks on validation errors (warnings are allowed).
 */
export async function commitDraftAction(
  storyId: string,
): Promise<ActionResult<{ warnings: ValidationIssue[] }>> {
  ensureDev();
  try {
    if (!STORY_ID_RE.test(storyId)) {
      return { ok: false, error: `Invalid storyId: ${storyId}` };
    }
    const result = await validateStory(storyId);
    if (!result.ok) {
      const summary = result.errors
        .slice(0, 8)
        .map((e) => `• ${e.where}: ${e.message}`)
        .join("\n");
      return {
        ok: false,
        error: `Validation failed (${result.errors.length} error(s)):\n${summary}`,
      };
    }

    // Write the story content module, then regenerate the barrel.
    await fs.writeFile(storyPath(storyId, "index.ts"), storyIndexSource(), "utf-8");
    await regenerateRegistry();

    // Mark committed.
    const meta = await readDraftMeta(storyId);
    if (meta) {
      await writeJson(DraftMetaSchema, storyPath(storyId, DRAFT_FILES.meta), {
        ...meta,
        status: "committed",
        currentStage: "review",
        updatedAt: nowIso(),
      });
    }

    revalidatePath("/admin");
    revalidatePath("/admin/generate");
    revalidatePath("/");
    revalidatePath(`/play/${storyId}`);
    return { ok: true, warnings: result.warnings };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Discard a draft — removes its src + public dirs and regenerates the
 * registry (so a previously-committed-then-discarded story drops out). Only
 * touches paths under the guarded story roots.
 */
export async function deleteDraftAction(
  storyId: string,
): Promise<ActionResult> {
  ensureDev();
  try {
    if (!STORY_ID_RE.test(storyId)) {
      return { ok: false, error: `Invalid storyId: ${storyId}` };
    }
    if (storyId.toLowerCase() === "wizard-of-oz") {
      return { ok: false, error: "Refusing to delete the bundled story." };
    }
    await fs.rm(storyDir(storyId), { recursive: true, force: true });
    await fs.rm(publicStoryDir(storyId), { recursive: true, force: true });
    await regenerateRegistry();
    revalidatePath("/admin");
    revalidatePath("/admin/generate");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
