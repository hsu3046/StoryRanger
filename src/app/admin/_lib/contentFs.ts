/**
 * Shared filesystem helpers for admin content writes (dev-only).
 *
 * These are plain server utilities (NOT a "use server" module) so both the
 * content save actions (`_actions/saveJson.ts`) and the generation draft
 * actions (`_actions/generateDraft.ts`) can import the SAME path-traversal
 * guards and JSON writer — keeping the security-sensitive logic in one place.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";

/** All content writes are dev-only — the filesystem is read-only on Vercel
 *  anyway, but an explicit refusal makes the failure mode obvious. */
export function ensureDev(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Admin writes are disabled in production builds.");
  }
}

// Safe id / filename character sets. Reject `..`, slashes, NUL, etc.
// storyId is LOWERCASE-only (slugify already lowercases) so a case variant
// can't dodge a guard like the wizard-of-oz delete protection, nor collide
// foo/Foo on a case-insensitive filesystem.
export const STORY_ID_RE = /^[a-z0-9_-]+$/;
export const FILENAME_RE = /^[a-z0-9_.-]+$/i;

/**
 * Build the JSON destination path for a story file under `src/stories/<id>/`,
 * with two safety nets: a strict regex on storyId + filename, then a resolved
 * path check that the result stays inside the stories root.
 */
export function storyPath(storyId: string, filename: string): string {
  if (!STORY_ID_RE.test(storyId)) {
    throw new Error(`Invalid storyId: ${JSON.stringify(storyId)}`);
  }
  if (!FILENAME_RE.test(filename)) {
    throw new Error(`Invalid filename: ${JSON.stringify(filename)}`);
  }
  const root = path.resolve(process.cwd(), "src", "stories");
  const resolved = path.resolve(root, storyId, filename);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes stories root");
  }
  return resolved;
}

/** Absolute path to a story's source dir (`src/stories/<id>/`). */
export function storyDir(storyId: string): string {
  if (!STORY_ID_RE.test(storyId)) {
    throw new Error(`Invalid storyId: ${JSON.stringify(storyId)}`);
  }
  const root = path.resolve(process.cwd(), "src", "stories");
  const resolved = path.resolve(root, storyId);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes stories root");
  }
  return resolved;
}

/** Absolute path to a story's public asset dir (`public/stories/<id>/`). */
export function publicStoryDir(storyId: string): string {
  if (!STORY_ID_RE.test(storyId)) {
    throw new Error(`Invalid storyId: ${JSON.stringify(storyId)}`);
  }
  const root = path.resolve(process.cwd(), "public", "stories");
  const resolved = path.resolve(root, storyId);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("Resolved path escapes public stories root");
  }
  return resolved;
}

/**
 * Build a JSON destination path for a GLOBAL (cross-story) content file under
 * `src/data/global/`. Same traversal safety as `storyPath`.
 */
export function globalPath(filename: string): string {
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

/** Validate `data` against `schema`, then write it pretty-printed (2-space
 *  indent) so git diffs stay clean. */
export async function writeJson<T>(
  schema: ZodType<T>,
  filePath: string,
  data: unknown,
): Promise<void> {
  const parsed = schema.parse(data);
  const json = `${JSON.stringify(parsed, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json, "utf-8");
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
