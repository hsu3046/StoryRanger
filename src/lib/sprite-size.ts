/**
 * Single source of truth for sprite display sizes.
 *
 * Asset PNGs are tightly trimmed (no transparent padding) so the natural
 * image aspect ratio reflects content. That means we MUST tell the renderer
 * how big each character/monster should display — otherwise a mouse and a
 * wolf would both render at the same height.
 *
 * `scale` here matches `SceneLayer.scale` semantics — a multiplier feeding
 * `heightPct = scale * 75` (clamped to [20, 95]). So scale 1.0 → 75% of
 * parent height; scale 0.3 → 22.5%.
 */

import type { CompanionId, SpeakerId } from "@/types/story";

export type SpriteSize = "tiny" | "small" | "medium" | "large" | "huge";

/** Maps a size tier to a numeric scale fed to SceneLayer.scale. */
export const SIZE_SCALE: Record<SpriteSize, number> = {
  tiny: 0.3,
  small: 0.45,
  medium: 0.6,
  large: 0.8,
  huge: 1.0,
};

export function sizeScale(size: SpriteSize | undefined): number | undefined {
  return size === undefined ? undefined : SIZE_SCALE[size];
}

/**
 * Display size per named character. Add new heroes/companions here when
 * the cast expands. `narrator` is never rendered as a sprite but kept in
 * the table so the type stays exhaustive.
 */
export const CHARACTER_SIZES: Record<SpeakerId | CompanionId, SpriteSize> = {
  narrator: "medium",
  dorothy: "medium",
  scarecrow: "medium",
  tinman: "medium",
  lion: "large",
  glinda: "medium",
  wizard: "large",
  "wicked-witch": "medium",
};

export function characterSize(
  id: SpeakerId | CompanionId | string,
): SpriteSize {
  return (CHARACTER_SIZES as Record<string, SpriteSize | undefined>)[id]
    ?? "medium";
}
