import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { BackgroundsEditor } from "@/app/admin/_components/BackgroundsEditor";
import { resolveAssetWithCommon } from "@/app/admin/_lib/resolveAsset";

function backgroundImageBase(storyId: string, key: string): string {
  return `/stories/${storyId}/backgrounds/${key}`;
}

const AUDIO_EXTS = [".mp3", ".ogg", ".m4a"];

async function listBgmKeysAt(...segments: string[]): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", ...segments);
  try {
    const entries = await fs.readdir(dir);
    const keys = new Set<string>();
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!AUDIO_EXTS.includes(ext)) continue;
      keys.add(file.slice(0, -ext.length));
    }
    return [...keys];
  } catch {
    return [];
  }
}

/** Story bgm keys + the shared/common pool, de-duped + sorted. */
async function listBgmKeys(storyId: string): Promise<string[]> {
  const [own, common] = await Promise.all([
    listBgmKeysAt("stories", storyId, "audio", "bgm"),
    listBgmKeysAt("audio", "bgm"),
  ]);
  return [...new Set([...own, ...common])].sort();
}

export default async function BackgroundsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();
  const backgrounds = repo.listBackgrounds(storyId);
  const bgmOptions = await listBgmKeys(storyId);

  const assetMap: Record<string, string | null> = {};
  for (const b of backgrounds) {
    // Story-first, then the shared/common pool (`public/backgrounds`).
    assetMap[b.key] = resolveAssetWithCommon(backgroundImageBase(storyId, b.key));
  }

  return (
    <BackgroundsEditor
      storyId={storyId}
      storyTitle={loaded.story.title}
      initial={backgrounds}
      bgmOptions={bgmOptions}
      assetMap={assetMap}
    />
  );
}
