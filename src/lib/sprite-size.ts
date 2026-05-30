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
