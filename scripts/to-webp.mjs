#!/usr/bin/env node
/**
 * Batch-convert all .jpg / .jpeg / .png in image folders to .webp (q=82).
 * Originals are preserved. Skips files that already have an up-to-date .webp.
 * Skips public/icons (PNG required by PWA manifest).
 *
 * Usage: node scripts/to-webp.mjs
 */
import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const DIRS = [
  "public/stories/wizard-of-oz",
  "public/stories/wizard-of-oz/scenes",
  "public/stories/wizard-of-oz/characters",
  "public/stories/wizard-of-oz/characters/battle",
  "public/stories/wizard-of-oz/backgrounds",
  "public/stories/wizard-of-oz/monsters",
  // Art-style gallery samples (Concept step picker) — selection thumbnails +
  // a modal preview, so cap at 1024px wide to keep them light.
  "public/image/style",
];

const EXTS = new Set([".jpg", ".jpeg", ".png"]);
const QUALITY = 82;
const FORCE = process.argv.includes("--force") || process.argv.includes("-f");

let totalIn = 0;
let totalOut = 0;
let converted = 0;
let skipped = 0;

for (const dir of DIRS) {
  let files;
  try {
    files = await readdir(dir);
  } catch {
    console.warn(`skip (missing dir): ${dir}`);
    continue;
  }

  for (const f of files) {
    const ext = extname(f).toLowerCase();
    if (!EXTS.has(ext)) continue;
    if (f.startsWith(".")) continue;

    const input = join(dir, f);
    const output = join(dir, basename(f, ext) + ".webp");

    const inStat = await stat(input);
    let outStat = null;
    try {
      outStat = await stat(output);
    } catch {
      /* not yet */
    }
    if (!FORCE && outStat && outStat.mtimeMs >= inStat.mtimeMs) {
      skipped++;
      continue;
    }

    // Trim transparent padding from monster + character sprites so the
    // image's natural aspect ratio reflects actual content. Skip background
    // / scene / cover images — those are full-bleed and should keep their
    // canvas size.
    const isSprite =
      dir.endsWith("/monsters") ||
      dir.endsWith("/characters") ||
      dir.endsWith("/characters/battle");
    const isStyleSample = dir.endsWith("/image/style");
    const pipeline = isSprite
      ? sharp(input).trim({ threshold: 5 })
      : isStyleSample
        ? sharp(input).resize({ width: 1024, withoutEnlargement: true })
        : sharp(input);
    const info = await pipeline.webp({ quality: QUALITY }).toFile(output);
    totalIn += inStat.size;
    totalOut += info.size;
    converted++;
    const ratio = ((info.size / inStat.size) * 100).toFixed(0);
    console.log(
      `${input}  →  ${basename(output)}  ${(info.size / 1024).toFixed(0)} KB (${ratio}% of original)`,
    );
  }
}

if (converted > 0) {
  const saved = ((1 - totalOut / totalIn) * 100).toFixed(0);
  console.log(
    `\n✓ Converted ${converted} files. Total: ${(totalIn / 1024 / 1024).toFixed(1)} MB → ${(totalOut / 1024 / 1024).toFixed(1)} MB (saved ${saved}%)`,
  );
}
if (skipped > 0) console.log(`(skipped ${skipped} up-to-date)`);
