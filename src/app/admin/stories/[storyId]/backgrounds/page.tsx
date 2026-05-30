import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { BackgroundsEditor } from "@/app/admin/_components/BackgroundsEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";

function backgroundImageBase(storyId: string, key: string): string {
  return `/stories/${storyId}/backgrounds/${key}`;
}

async function listBgmKeys(storyId: string): Promise<string[]> {
  // Scan the story's bgm folder so the BGM dropdown reflects what's actually
  // on disk. Falls back to an empty list if the folder doesn't exist —
  // BackgroundsEditor will then accept the saved value as a "custom" entry.
  const dir = path.join(
    process.cwd(),
    "public",
    "stories",
    storyId,
    "audio",
    "bgm",
  );
  try {
    const entries = await fs.readdir(dir);
    const audioExts = [".mp3", ".ogg", ".m4a"];
    const keys = new Set<string>();
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!audioExts.includes(ext)) continue;
      keys.add(file.slice(0, -ext.length));
    }
    return [...keys].sort();
  } catch {
    return [];
  }
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
    assetMap[b.key] = resolveAssetPath(backgroundImageBase(storyId, b.key));
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
