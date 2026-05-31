import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getStory } from "@/lib/stories";
import { MEDALS } from "@/data/medals";
import { StoryPlayer } from "@/components/play/StoryPlayer";

interface Props {
  params: Promise<{ storyId: string }>;
}

const AUDIO_EXTS = new Set([".mp3", ".ogg", ".m4a", ".wav"]);

/** Scan the story's BGM folder so the player only crossfades to an encounter
 *  track (`battle`, `puzzle`, …) when the file actually exists — otherwise the
 *  scene BGM keeps playing instead of cutting to silence. */
async function listBgmKeys(storyId: string): Promise<string[]> {
  const dir = path.join(
    process.cwd(),
    "public",
    "stories",
    storyId,
    "audio",
    "bgm",
  );
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
  const bgmKeys = await listBgmKeys(storyId);
  return (
    <StoryPlayer
      story={loaded.story}
      medals={MEDALS}
      characters={loaded.characters}
      bgmKeys={bgmKeys}
    />
  );
}
