import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { MEDALS } from "@/data/medals";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";
import { storyAssetId } from "@/lib/asset-paths";
import { StoryGraphEditor } from "@/app/admin/_components/graph/StoryGraphEditor";
import type { EncounterDefT, StoryT } from "@/data/schemas";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);
const AUDIO_EXTS = new Set([".mp3", ".ogg", ".m4a"]);

/** Scan a public folder (segments under /public) → de-duped stems (no ext). */
async function listStemsAt(
  exts: Set<string>,
  ...segments: string[]
): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", ...segments);
  try {
    const entries = await fs.readdir(dir);
    const stems = new Set<string>();
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!exts.has(ext)) continue;
      stems.add(file.slice(0, -ext.length));
    }
    return [...stems];
  } catch {
    return [];
  }
}

/** A story's own stems PLUS the shared/common pool's, de-duped + sorted. */
async function listStems(
  storyId: string,
  subdir: string,
  commonSubdir: string,
  exts: Set<string>,
): Promise<string[]> {
  const [own, common] = await Promise.all([
    listStemsAt(exts, "stories", storyId, ...subdir.split("/")),
    listStemsAt(exts, ...commonSubdir.split("/")),
  ]);
  return [...new Set([...own, ...common])].sort();
}

export default async function GraphPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();

  // Duplicated stories share their source's media — every disk scan below walks
  // the ASSET id's folders (identical to storyId for non-duplicates), so the
  // editor's dropdowns/preview see the shared art, like /play does.
  const assetId = storyAssetId(loaded.story);
  const [sceneStems, storyBgmKeys, commonBgmKeys, backgroundKeys] =
    await Promise.all([
      // Scenes are story-only; BGM + backgrounds merge the shared/common pool.
      listStemsAt(IMAGE_EXTS, "stories", assetId, "scenes"),
      // BGM kept SPLIT by pool. The per-scene dropdown wants them merged
      // (bgmOptions below), but the preview's StoryPlayer needs story vs common
      // separate — to resolve each track to the right folder AND to fill the
      // battle/puzzle variant pools. Passing them is what makes battle BGM play
      // in the branch preview, matching the live /play page.
      listStemsAt(AUDIO_EXTS, "stories", assetId, "audio", "bgm"),
      listStemsAt(AUDIO_EXTS, "audio", "bgm"),
      // Battle background stems — this story's /backgrounds folder merged with the
      // shared /public/backgrounds pool. Scanned from disk (no JSON catalog), the
      // same way Scene Image is sourced.
      listStems(assetId, "backgrounds", "backgrounds", IMAGE_EXTS),
    ]);
  // Merged + sorted for the per-scene BGM dropdown (story overrides common).
  const bgmOptions = [...new Set([...storyBgmKeys, ...commonBgmKeys])].sort();

  // Scene image dropdown stores the full path but displays only the
  // filename stem — keeps the data structure unchanged while shortening
  // the UI label. Paths point at the ASSET folder (duplicate source for duplicated
  // stories) — picking one stores a path that resolves for the duplicate too.
  const sceneImages = sceneStems.map((stem) => ({
    value: `/stories/${assetId}/scenes/${stem}`,
    label: stem,
  }));

  return (
    <StoryGraphEditor
      storyId={storyId}
      assetStoryId={assetId}
      initialStory={loaded.story as StoryT}
      initialEncounters={repo.listEncounters(storyId) as EncounterDefT[]}
      monsters={repo.listMonsters(storyId)}
      items={repo.listItems(storyId)}
      backgroundKeys={backgroundKeys}
      sceneImages={sceneImages}
      bgmOptions={bgmOptions}
      bgmKeys={storyBgmKeys}
      commonBgmKeys={commonBgmKeys}
      runtimeStory={loaded.story}
      runtimeMedalsFile={MEDALS}
      runtimeCharactersFile={loaded.characters}
      mapImage={resolveAssetPath(`/stories/${assetId}/map/map`)}
    />
  );
}
