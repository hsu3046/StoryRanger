/**
 * Dev-only image writer for the generation pipeline. Writes webp (served) +
 * png (durable original) under `public/stories/<id>/<folder>/<name>.*` and
 * best-effort mirrors the webp to R2. Mirrors the path-traversal safety of the
 * JSON save actions. Also loads saved sprites back as base64 reference images
 * for character-consistency conditioning.
 *
 * Plain server module (node:fs) — imported by the image route handlers.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { hasR2, r2Put } from "@/lib/r2";
import type { ReferenceImage } from "@/lib/image-gen";
import { ensureDev, publicStoryDir, STORY_ID_RE } from "./contentFs";

/** Allowed image sub-folders (""=story root, for cover). */
const FOLDER_ALLOW = new Set([
  "",
  "scenes",
  "backgrounds",
  "characters",
  "characters/battle",
  "dialogue",
  "monsters",
]);
const NAME_RE = /^[a-z0-9_.-]+$/i;

function destDir(storyId: string, folder: string): string {
  const root = publicStoryDir(storyId); // guards storyId
  if (!FOLDER_ALLOW.has(folder)) {
    throw new Error(`Invalid image folder: ${JSON.stringify(folder)}`);
  }
  return folder ? path.join(root, ...folder.split("/")) : root;
}

function webPath(storyId: string, folder: string, name: string): string {
  return `/stories/${storyId}/${folder ? `${folder}/` : ""}${name}`;
}

export interface SaveImageArgs {
  storyId: string;
  folder: string;
  /** Extensionless base name (e.g. "01-kansas-farm", "hero", "cover"). */
  name: string;
  webp: Buffer;
  png?: Buffer;
  /** Mirror the webp to R2 when configured (default true). */
  mirrorR2?: boolean;
}

export async function saveStoryImage(
  args: SaveImageArgs,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  ensureDev();
  try {
    if (!STORY_ID_RE.test(args.storyId)) {
      throw new Error(`Invalid storyId: ${args.storyId}`);
    }
    if (!NAME_RE.test(args.name)) {
      throw new Error(`Invalid image name: ${args.name}`);
    }
    const dir = destDir(args.storyId, args.folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${args.name}.webp`), args.webp);
    if (args.png) {
      await fs.writeFile(path.join(dir, `${args.name}.png`), args.png);
    }

    const mirror = args.mirrorR2 ?? true;
    if (mirror && hasR2()) {
      const key = `stories/${args.storyId}/${args.folder ? `${args.folder}/` : ""}${args.name}.webp`;
      try {
        await r2Put(key, args.webp, "image/webp");
      } catch (e) {
        console.warn("[saveStoryImage] R2 mirror failed (kept local):", e);
      }
    }

    return { ok: true, path: webPath(args.storyId, args.folder, args.name) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Load a previously-saved sprite as a base64 reference image (png preferred —
 * a cleaner conditioning input — else webp). Returns null when absent.
 */
export async function loadReferenceImage(
  storyId: string,
  folder: string,
  name: string,
): Promise<ReferenceImage | null> {
  if (!STORY_ID_RE.test(storyId) || !NAME_RE.test(name)) return null;
  let dir: string;
  try {
    dir = destDir(storyId, folder);
  } catch {
    return null;
  }
  for (const [ext, mimeType] of [
    [".png", "image/png"],
    [".webp", "image/webp"],
  ] as const) {
    try {
      const buf = await fs.readFile(path.join(dir, `${name}${ext}`));
      return { mimeType, data: buf.toString("base64") };
    } catch {
      /* try next */
    }
  }
  return null;
}
