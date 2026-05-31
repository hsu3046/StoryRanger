import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { MonstersEditor } from "@/app/admin/_components/MonstersEditor";
import { resolveAssetWithCommon } from "@/app/admin/_lib/resolveAsset";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);

function monsterImageBase(storyId: string, monsterId: string): string {
  return `/stories/${storyId}/monsters/${monsterId}`;
}

/** Scan a public monsters folder (story or common) for image stems. */
async function listMonsterImageStems(...segments: string[]): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", ...segments);
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
    // Story-first, then the shared/common pool.
    assetMap[m.id] = resolveAssetWithCommon(base);
  }

  // Image picker = this story's monster images + the shared/common pool
  // (`public/monsters`). Common-only stems are labelled so the author can tell
  // them apart; a story stem of the same name takes precedence (listed first).
  const [storyStems, commonStems] = await Promise.all([
    listMonsterImageStems("stories", storyId, "monsters"),
    listMonsterImageStems("monsters"),
  ]);
  const storySet = new Set(storyStems);
  const imageOptions = [
    ...storyStems.map((stem) => ({
      value: `/stories/${storyId}/monsters/${stem}`,
      label: stem,
    })),
    ...commonStems
      .filter((stem) => !storySet.has(stem))
      .map((stem) => ({ value: `/monsters/${stem}`, label: `${stem} (common)` })),
  ];

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
