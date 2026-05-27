import path from "node:path";
import { existsSync } from "node:fs";

const EXTS = [
  ".webp",
  ".png",
  ".jpeg",
  ".jpg",
  ".WEBP",
  ".PNG",
  ".JPEG",
  ".JPG",
];

/**
 * Server-side asset resolver. Takes a public path (e.g.
 * `/stories/wizard-of-oz/characters/hero`) and returns the first
 * extension that exists on disk. Returns `null` if no file is found —
 * letting the caller render a placeholder immediately, without making
 * the browser flicker through onError chains.
 */
export function resolveAssetPath(base: string): string | null {
  const root = path.join(process.cwd(), "public");
  const lastDot = base.lastIndexOf(".");
  const lastSlash = base.lastIndexOf("/");
  const hasExt = lastDot > lastSlash;
  const stem = hasExt ? base.slice(0, lastDot) : base;

  const candidates = hasExt
    ? [base, ...EXTS.map((e) => stem + e)]
    : EXTS.map((e) => stem + e);

  for (const candidate of candidates) {
    const fsPath = path.join(root, candidate);
    if (existsSync(fsPath)) return candidate;
  }
  return null;
}
