/**
 * Image post-processing — Nano Banana outputs opaque PNG, the runtime serves
 * webp (full-bleed scenes) and trimmed transparent webp/png (sprites).
 *
 * Ports the to-webp.mjs conventions (sharp, quality 82, sprite trim) into an
 * in-process pipeline. Sprites are generated on a flat white background (the
 * model can't reliably output true alpha — see docs/ASSETS_CHARACTERS.md), so
 * we key the OUTER white to transparent via a border flood-fill (interior
 * whites — eyes, clothing — are preserved because they aren't reachable from
 * the border through white), then trim the transparent padding.
 */

import sharp from "sharp";

const QUALITY = 82;
/** Pixels at/above this on every channel count as "white" for keying. */
const WHITE_THRESHOLD = 240;

/** Full-bleed image (scene / cover / background) → webp + png. No trim. */
export async function processFullBleed(
  png: Buffer,
): Promise<{ webp: Buffer; png: Buffer }> {
  const webp = await sharp(png).webp({ quality: QUALITY }).toBuffer();
  return { webp, png };
}

/** Sprite (character / monster / portrait) → transparent, trimmed webp + png. */
export async function processSprite(
  png: Buffer,
): Promise<{ webp: Buffer; png: Buffer }> {
  const transparent = await keyOutBorderWhite(png);
  const trimmed = sharp(transparent).ensureAlpha().trim({ threshold: 5 });
  const webp = await trimmed.clone().webp({ quality: QUALITY }).toBuffer();
  const pngOut = await trimmed.clone().png().toBuffer();
  return { webp, png: pngOut };
}

/**
 * Flood-fill the outer white background to transparent. BFS from every border
 * pixel through connected near-white pixels; only those reached become
 * transparent, so white INSIDE the subject is left untouched.
 */
async function keyOutBorderWhite(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels === 4

  const isWhite = (p: number): boolean => {
    const i = p * channels;
    return (
      data[i] >= WHITE_THRESHOLD &&
      data[i + 1] >= WHITE_THRESHOLD &&
      data[i + 2] >= WHITE_THRESHOLD
    );
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const seed = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (isWhite(p)) stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }

  while (stack.length) {
    const p = stack.pop()!;
    data[p * channels + 3] = 0; // alpha → transparent
    const x = p % width;
    const y = (p / width) | 0;
    seed(x + 1, y);
    seed(x - 1, y);
    seed(x, y + 1);
    seed(x, y - 1);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
