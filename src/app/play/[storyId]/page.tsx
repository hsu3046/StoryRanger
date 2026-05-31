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
  const [bgmKeys, commonBgmKeys] = await Promise.all([
    listBgmKeysAt("stories", storyId, "audio", "bgm"),
    listBgmKeysAt("audio", "bgm"),
  ]);
  return (
    <StoryPlayer
      story={loaded.story}
      medals={MEDALS}
      characters={loaded.characters}
      bgmKeys={bgmKeys}
      commonBgmKeys={commonBgmKeys}
    />
  );
}
