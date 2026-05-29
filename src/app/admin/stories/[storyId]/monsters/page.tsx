import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { MonstersEditor } from "@/app/admin/_components/MonstersEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);

function monsterImageBase(storyId: string, monsterId: string): string {
  return `/stories/${storyId}/monsters/${monsterId}`;
}

/** Scan /public/stories/<id>/monsters/ for image stems. Mirrors the
 *  Character image scan in characters/page.tsx. */
async function listMonsterImageStems(storyId: string): Promise<string[]> {
  const dir = path.join(
    process.cwd(),
    "public",
    "stories",
    storyId,
    "monsters",
  );
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const stems = new Set<string>();
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      stems.add(e.name.slice(0, -ext.length));
    }
    return [...stems].sort();
  } catch {
    return [];
  }
}

export default async function MonstersPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();
  const monsters = repo.listMonsters(storyId);
  const items = repo.listItems(storyId);

  const assetMap: Record<string, string | null> = {};
  for (const m of monsters) {
    const base = m.image ?? monsterImageBase(storyId, m.id);
    assetMap[m.id] = resolveAssetPath(base);
  }

  const imageOptions = (await listMonsterImageStems(storyId)).map((stem) => ({
    value: `/stories/${storyId}/monsters/${stem}`,
    label: stem,
  }));

  return (
    <MonstersEditor
      storyId={storyId}
      storyTitle={loaded.story.title}
      initial={monsters}
      itemCatalog={items}
      assetMap={assetMap}
      imageOptions={imageOptions}
    />
  );
}
