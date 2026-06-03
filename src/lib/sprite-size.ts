/**
 * Single source of truth for sprite display sizes.
 *
 * Asset PNGs are tightly trimmed (no transparent padding) so the natural
 * image aspect ratio reflects content. That means we MUST tell the renderer
 * how big each character/monster should display — otherwise a mouse and a
 * wolf would both render at the same height.
 *
 * `scale` here matches `SceneLayer.scale` semantics. SpriteLayer converts
 * it to a `dvh` value (heightDvh = clamp(15, 92, scale * 80)) so sizes are
 * tied DIRECTLY to the dynamic viewport — they don't rely on any % chain
 * through parent containers, which is fragile under nested fixed/absolute
 * positioning and safe-area insets.
 *
 * Visual targets on a portrait phone (~850dvh):
 *   tiny:   ~28dvh — small companion at hero's knee (Toto)
 *   small:  ~44dvh — a wolf pup
 *   medium: ~56dvh — Dorothy / scarecrow / tin man
 *   large:  ~72dvh — lion / wizard / a brawny enemy
 *   huge:   ~92dvh — scene-dominating threats (fighting tree, kalidah)
 */

import type { CompanionId, SpeakerId } from "@/types/story";

export type SpriteSize = "tiny" | "small" | "medium" | "large" | "huge";

/** Maps a size tier to a numeric scale fed to SceneLayer.scale. */
export const SIZE_SCALE: Record<SpriteSize, number> = {
  tiny: 0.35,
  small: 0.55,
  medium: 0.7,
  large: 0.9,
  huge: 1.15,
};

export function sizeScale(size: SpriteSize | undefined): number | undefined {
  return size === undefined ? undefined : SIZE_SCALE[size];
}

/**
 * Adds a small, DETERMINISTIC size variation on top of a tier scale so sprites
 * of the same tier don't all render at the exact same height — two wolves in
 * one fight read as slightly different. The factor is hashed from `seed`
 * (e.g. `monsterId:slot`) so it's stable across re-renders (no flicker) yet
 * differs per instance.
 *
 * Bounded to ±8%, which always stays well inside the tier's band — the result
 * never reaches the midpoint to a neighbouring tier, so a `large` monster never
 * reads as `huge` (the tier gaps are ≥0.15 and the nearest midpoint is ≥11%
 * away from every tier value). Returns undefined unchanged (no size set).
 */
export function jitterScale(
  scale: number | undefined,
  seed: string,
): number | undefined {
  if (scale === undefined) return undefined;
  // FNV-1a → a stable pseudo-random in [0, 1) for this seed.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const t = ((h >>> 0) % 1000) / 1000;
  const factor = 0.92 + t * 0.16; // [0.92, 1.08)
  return scale * factor;
}

/**
 * Per-character sprite size lives in each story's `characters.json` —
 * see CharacterSchema (`size` field). This helper looks it up from a
 * characters lookup the caller provides, falling back to "medium" when
 * the id isn't in the table (e.g. a freshly added speaker that hasn't
 * been added to characters.json yet).
 *
 * Keeping the lookup signature explicit (instead of importing the
 * wizard-of-oz characters here) avoids coupling the sprite lib to any
 * one story.
 */
export function characterSize(
  id: SpeakerId | CompanionId | string,
  characters: ReadonlyArray<{ id: string; size?: SpriteSize }>,
): SpriteSize {
  const found = characters.find((c) => c.id === id);
  return found?.size ?? "medium";
}
