import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getStory } from "@/lib/stories";
import { getSessionUser, ensureProfile } from "@/lib/supabase/queries";
import { MEDALS } from "@/data/medals";
import { StoryPlayer } from "@/components/play/StoryPlayer";
import { sceneImageWebpUrl, storyAssetId } from "@/lib/asset-paths";

interface Props {
  params: Promise<{ storyId: string }>;
}

const AUDIO_EXTS = new Set([".mp3", ".ogg", ".m4a", ".wav"]);
/** Map image extensions, in resolution order (webp preferred). */
const MAP_EXTS = ["webp", "jpeg", "jpg", "png"] as const;

/** Resolve the story's map image (`public/stories/<id>/map/map.<ext>`) to a
 *  public path, or null when the story has no map folder/image. Drives the
 *  in-game map button — only shown when an image exists. */
async function resolveMapImage(storyId: string): Promise<string | null> {
  for (const ext of MAP_EXTS) {
    const rel = `stories/${storyId}/map/map.${ext}`;
    try {
      await fs.access(path.join(process.cwd(), "public", rel));
      return `/${rel}`;
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

/** Scan a BGM folder for track keys (filename without extension). Used for the
 *  story's own folder + the shared/common pool so the player can resolve a key
 *  to whichever exists (story overrides common) and only crossfades to an
 *  encounter track when a file is actually present. */
async function listBgmKeysAt(...segments: string[]): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", ...segments);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const keys = new Set<string>();
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!AUDIO_EXTS.has(ext)) continue;
      keys.add(e.name.slice(0, -ext.length));
    }
    return [...keys];
  } catch {
    return [];
  }
}

export default async function PlayPage({ params }: Props) {
  const { storyId } = await params;
  const loaded = getStory(storyId);
  if (!loaded) notFound();

  // The proxy gates this route, so a logged-in user is expected. Direct /play
  // deep-links bypass the home screen, so guarantee a profile row here too (the
  // client-side migration + sync depend on it). Tolerates Supabase being unset.
  const user = await getSessionUser().catch(() => null);
  if (user) await ensureProfile(user).catch(() => null);
  // Duplicates share their source story's media — scan/resolve the ASSET id's
  // folder, not our own (identical for every non-duplicate).
  const assetId = storyAssetId(loaded.story);
  const [bgmKeys, commonBgmKeys, mapImage] = await Promise.all([
    listBgmKeysAt("stories", assetId, "audio", "bgm"),
    listBgmKeysAt("audio", "bgm"),
    resolveMapImage(assetId),
  ]);
  // Preload the start scene's image into the streamed HTML so the browser
  // fetches it in parallel with the JS bundle (high priority) — it's warm
  // before StoryPlayer mounts. React 19 hoists this <link> into <head>. Covers
  // a fresh game + a hard refresh on /play; the client preload in beginDive()
  // additionally warms the SAVED scene for "Continue". webp only (every scene
  // ships one, so SceneImage's extension fallback never fires on the happy
  // path). Direct from the asset CDN — no Vercel image optimizer.
  const startScene = loaded.story.scenes[loaded.story.startScene];
  const startImageHref = startScene
    ? sceneImageWebpUrl(startScene.image)
    : null;
  return (
    <>
      {startImageHref && (
        <link
          rel="preload"
          as="image"
          href={startImageHref}
          type="image/webp"
          fetchPriority="high"
        />
      )}
      <StoryPlayer
        story={loaded.story}
        medals={MEDALS}
        characters={loaded.characters}
        bgmKeys={bgmKeys}
        commonBgmKeys={commonBgmKeys}
        mapImage={mapImage}
      />
    </>
  );
}
