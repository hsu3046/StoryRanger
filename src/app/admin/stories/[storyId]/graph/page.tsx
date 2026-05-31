import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { MEDALS } from "@/data/medals";
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

  const [sceneStems, bgmOptions, commonBackgroundKeys] = await Promise.all([
    // Scenes are story-only; BGM merges the shared/common pool.
    listStemsAt(IMAGE_EXTS, "stories", storyId, "scenes"),
    listStems(storyId, "audio/bgm", "audio/bgm", AUDIO_EXTS),
    // Shared background image stems — offered in the battle bg dropdown
    // alongside this story's catalog (resolved from /backgrounds at runtime).
    listStemsAt(IMAGE_EXTS, "backgrounds"),
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
      commonBackgroundKeys={commonBackgroundKeys}
      sceneImages={sceneImages}
      bgmOptions={bgmOptions}
      runtimeStory={loaded.story}
      runtimeMedalsFile={MEDALS}
      runtimeCharactersFile={loaded.characters}
    />
  );
}
