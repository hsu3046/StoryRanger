/**
 * Shared ("common") vs per-story asset resolution.
 *
 * Every story-scoped asset lives at `/stories/<storyId>/<rest>` and has a
 * shared twin at `/<rest>` (e.g. `/stories/oz/backgrounds/x` ↔ `/backgrounds/x`,
 * `/stories/oz/audio/bgm/x` ↔ `/audio/bgm/x`, `/stories/oz/monsters/x` ↔
 * `/monsters/x`). A story may keep its own copy OR draw from the common pool.
 *
 * Resolution precedence: **story overrides common** — the story-scoped path is
 * tried first, then the common path as a fallback. So a story customises an
 * asset by dropping a same-named file in its own folder, and otherwise inherits
 * the shared one.
 */

/**
 * The common/shared equivalent of a story-scoped asset path, or `null` if the
 * path isn't story-scoped (already common, or an unrelated path).
 *
 *   "/stories/wizard-of-oz/backgrounds/cornfield" → "/backgrounds/cornfield"
 *   "/audio/bgm/battle"                            → null  (already common)
 */
export function commonAssetPath(path: string): string | null {
  const common = path.replace(/^\/stories\/[^/]+\//, "/");
  return common !== path ? common : null;
}
