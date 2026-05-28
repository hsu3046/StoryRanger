import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { StoryGraphEditor } from "@/app/admin/_components/graph/StoryGraphEditor";
import type { EncounterDefT, StoryT } from "@/data/schemas";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);
const AUDIO_EXTS = new Set([".mp3", ".ogg", ".m4a"]);

/** Scan a folder and return de-duped path stems (no extension). */
async function listStems(
  storyId: string,
  subdir: string,
  exts: Set<string>,
): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "stories", storyId, subdir);
  try {
    const entries = await fs.readdir(dir);
    const stems = new Set<string>();
    for (const file of entries) {
      const ext = path.extname(file).toLowerCase();
      if (!exts.has(ext)) continue;
      stems.add(file.slice(0, -ext.length));
    }
    return [...stems].sort();
  } catch {
    return [];
  }
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

  const [sceneStems, bgmOptions] = await Promise.all([
    listStems(storyId, "scenes", IMAGE_EXTS),
    listStems(storyId, "audio/bgm", AUDIO_EXTS),
  ]);

  // Scene image dropdown stores the full path but displays only the
  // filename stem — keeps the data structure unchanged while shortening
  // the UI label.
  const sceneImages = sceneStems.map((stem) => ({
    value: `/stories/${storyId}/scenes/${stem}`,
    label: stem,
  }));

  return (
    <StoryGraphEditor
      storyId={storyId}
      initialStory={loaded.story as StoryT}
      initialEncounters={repo.listEncounters(storyId) as EncounterDefT[]}
      monsters={repo.listMonsters(storyId)}
      items={repo.listItems(storyId)}
      backgrounds={repo.listBackgrounds(storyId)}
      medals={loaded.medals.medals}
      sceneImages={sceneImages}
      bgmOptions={bgmOptions}
      runtimeStory={loaded.story}
      runtimeMedalsFile={loaded.medals}
      runtimeCharactersFile={loaded.characters}
    />
  );
}
