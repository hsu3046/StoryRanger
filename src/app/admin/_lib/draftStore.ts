/**
 * Read-side helpers for generation drafts. Wizard server pages call these to
 * load draft state directly from disk — an in-progress draft is NOT in the
 * story registry, so it can't be read through `contentRepo()`/`getStory()`.
 *
 * Plain server module (node:fs) — NOT "use server" (those may only export
 * async actions). Dev-only in practice.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CharacterArtFileSchema,
  CharactersFileSchema,
  ConceptSchema,
  DraftMetaSchema,
  DraftSceneMetaSchema,
  StorySchema,
  StoryboardSchema,
  type CharacterArtFileT,
  type ConceptT,
  type DraftMetaT,
  type DraftSceneMetaT,
  type StoryboardT,
} from "@/data/schemas";
import type { CharactersFile, Story } from "@/types/story";
import { storyDir, STORY_ID_RE } from "./contentFs";

export const DRAFT_FILES = {
  meta: "draft.meta.json",
  concept: "draft.concept.json",
  storyboard: "draft.storyboard.json",
  characterArt: "draft.characterArt.json",
  sceneMeta: "draft.scenemeta.json",
} as const;

async function readJsonSafe<T>(
  storyId: string,
  filename: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(storyDir(storyId), filename), "utf-8");
    const res = schema.safeParse(JSON.parse(raw) as unknown);
    return res.success ? (res.data as T) : null;
  } catch {
    return null;
  }
}

/** Legacy stage ids (pre-merge) → active stage. "scenes"/"narration"/"images"
 *  all fold into "scene" — image generation now lives on the Scene tab, so a
 *  draft paused mid-image-gen should resume there (not skip to Review). */
function normalizeStage(stage: unknown): unknown {
  if (stage === "scenes" || stage === "narration" || stage === "images") {
    return "scene";
  }
  return stage;
}

export async function readDraftMeta(storyId: string): Promise<DraftMetaT | null> {
  try {
    const raw = await fs.readFile(
      path.join(storyDir(storyId), DRAFT_FILES.meta),
      "utf-8",
    );
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj && typeof obj === "object") {
      obj.currentStage = normalizeStage(obj.currentStage);
    }
    const res = DraftMetaSchema.safeParse(obj);
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}
/** Flatten a legacy free-form art-style bible (medium/palette/lineQuality/mood/
 *  motifs/negative) into a single style prompt, so a draft authored before the
 *  template gallery keeps its visual direction. */
function flattenLegacyBible(b: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const parts = [
    str(b.medium),
    str(b.palette),
    str(b.lineQuality),
    str(b.mood),
  ].filter(Boolean);
  const motifs = arr(b.motifs);
  if (motifs.length) parts.push(`recurring motifs: ${motifs.join(", ")}`);
  const neg = arr(b.negative);
  if (neg.length) parts.push(`avoid: ${neg.join(", ")}`);
  return parts.join("; ");
}

export async function readConcept(storyId: string): Promise<ConceptT | null> {
  try {
    const raw = await fs.readFile(
      path.join(storyDir(storyId), DRAFT_FILES.concept),
      "utf-8",
    );
    const obj = JSON.parse(raw) as Record<string, unknown>;
    // Back-compat: drafts authored before the art-style template gallery carry a
    // free-form `artStyleBible` but no `artStylePrompt`. The new schema drops the
    // unknown key, which would silently lose the visual direction; synthesize a
    // prompt from the old bible so reopening/regenerating an old draft keeps its
    // look until the author picks a template.
    if (
      obj &&
      typeof obj === "object" &&
      !obj.artStylePrompt &&
      obj.artStyleBible &&
      typeof obj.artStyleBible === "object"
    ) {
      obj.artStylePrompt = flattenLegacyBible(
        obj.artStyleBible as Record<string, unknown>,
      );
    }
    const res = ConceptSchema.safeParse(obj);
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}
export function readStoryboard(storyId: string): Promise<StoryboardT | null> {
  return readJsonSafe(storyId, DRAFT_FILES.storyboard, StoryboardSchema);
}
export function readCharacterArt(
  storyId: string,
): Promise<CharacterArtFileT | null> {
  return readJsonSafe(storyId, DRAFT_FILES.characterArt, CharacterArtFileSchema);
}
export function readDraftScenes(storyId: string): Promise<Story | null> {
  return readJsonSafe(storyId, "scenes.json", StorySchema) as Promise<Story | null>;
}
export function readDraftCharacters(
  storyId: string,
): Promise<CharactersFile | null> {
  return readJsonSafe(
    storyId,
    "characters.json",
    CharactersFileSchema,
  ) as Promise<CharactersFile | null>;
}
export function readDraftSceneMeta(
  storyId: string,
): Promise<DraftSceneMetaT | null> {
  return readJsonSafe(storyId, DRAFT_FILES.sceneMeta, DraftSceneMetaSchema);
}

/** True when a story dir has been committed (has an index.ts → in registry). */
export async function isCommitted(storyId: string): Promise<boolean> {
  try {
    await fs.access(path.join(storyDir(storyId), "index.ts"));
    return true;
  } catch {
    return false;
  }
}

/** All in-progress drafts (dirs with a draft.meta.json), newest first. */
export async function listDrafts(): Promise<DraftMetaT[]> {
  const root = path.resolve(process.cwd(), "src", "stories");
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const metas: DraftMetaT[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !STORY_ID_RE.test(e.name)) continue;
    const meta = await readDraftMeta(e.name);
    if (meta) metas.push(meta);
  }
  return metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * Extensionless base names of images present under
 * `public/stories/<id>/<folder>/`. Used by the image stage to derive which
 * items are already done on resume.
 */
export async function listPresentImageStems(
  storyId: string,
  folder: string,
): Promise<string[]> {
  if (!STORY_ID_RE.test(storyId)) return [];
  const dir = path.resolve(
    process.cwd(),
    "public",
    "stories",
    storyId,
    ...folder.split("/").filter(Boolean),
  );
  try {
    const files = await fs.readdir(dir);
    const stems = new Set<string>();
    for (const f of files) {
      const m = /^(.+)\.(webp|png|jpe?g)$/i.exec(f);
      if (m) stems.add(m[1]);
    }
    return [...stems];
  } catch {
    return [];
  }
}

/** BGM track stems available to a draft: its own /audio/bgm pool merged with
 *  the shared /public/audio/bgm pool (mirrors the graph editor's bgmOptions). */
export async function listBgmKeys(storyId: string): Promise<string[]> {
  const exts = [".mp3", ".ogg", ".m4a"];
  const scan = async (...segments: string[]): Promise<string[]> => {
    const dir = path.resolve(process.cwd(), "public", ...segments);
    try {
      const files = await fs.readdir(dir);
      const stems = new Set<string>();
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (exts.includes(ext)) stems.add(f.slice(0, -ext.length));
      }
      return [...stems];
    } catch {
      return [];
    }
  };
  if (!STORY_ID_RE.test(storyId)) return [];
  const [own, common] = await Promise.all([
    scan("stories", storyId, "audio", "bgm"),
    scan("audio", "bgm"),
  ]);
  return [...new Set([...own, ...common])].sort();
}

/** True when a story-root image (e.g. cover) is present in any ext variant. */
export async function coverPresent(storyId: string): Promise<boolean> {
  if (!STORY_ID_RE.test(storyId)) return false;
  const base = path.resolve(process.cwd(), "public", "stories", storyId, "cover");
  for (const ext of [".webp", ".png", ".jpeg", ".jpg"]) {
    try {
      await fs.access(base + ext);
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}
