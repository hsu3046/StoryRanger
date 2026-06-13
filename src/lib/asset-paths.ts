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
 * The story id to build DERIVED asset paths from (character sprites,
 * dialogue portraits, BGM folder, map, monster sprite fallbacks). A duplicated
 * story sets `assetStoryId` to its duplicate source and ships zero copied media
 * — every derived path resolves into the source's folder. STORED paths
 * (scene.image, coverImage, character/monster `image` overrides) are not
 * affected: they carry their own story segment, which is exactly how a
 * duplicate diverges asset-by-asset later.
 */
export function storyAssetId(story: {
  id: string;
  assetStoryId?: string;
}): string {
  return story.assetStoryId?.trim() || story.id;
}

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

/**
 * Base origin for serving static media (images + audio). Empty string = serve
 * same-origin from `public/` (the dev/default). Set
 * `NEXT_PUBLIC_ASSET_BASE_URL` to a CDN origin — e.g. a Cloudflare R2 bucket's
 * `https://<id>.r2.dev` (dev) or a custom domain (prod) — to serve media from
 * there instead. `public/` stays the source of truth; the bucket is a mirror.
 */
export const ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? ""
).replace(/\/+$/, "");

/**
 * Prefix a root-relative asset path (`/stories/...`, `/audio/...`,
 * `/backgrounds/...`) with the configured asset base. Already-absolute URLs
 * (`http(s):`, `data:`, `blob:`) and non-rooted strings pass through unchanged,
 * so it's safe to wrap every `src` indiscriminately.
 */
export function assetUrl(path: string): string {
  // Guard nullish/empty: callers wrap every `src` indiscriminately, and a
  // thumbnail with no resolved candidate passes `undefined` here. Returning it
  // unchanged renders `<img src={undefined}>` (harmless) instead of throwing on
  // `.startsWith`.
  if (!path || !ASSET_BASE_URL || !path.startsWith("/")) return path;
  return ASSET_BASE_URL + path;
}

/**
 * The fully-resolved `.webp` URL for a scene image path. `SceneImage` always
 * requests the `.webp` candidate first (every scene ships a webp), so this is
 * the exact URL it will fetch — making it the safe target for a `<link
 * rel="preload">` / `ReactDOM.preload()` that warms the image during the home
 * dive without ever preloading a 404 fallback variant.
 */
export function sceneImageWebpUrl(imagePath: string): string {
  const base = imagePath.replace(/\.(webp|png|jpg|jpeg)$/i, "");
  return assetUrl(base + ".webp");
}
