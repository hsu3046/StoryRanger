import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { MonstersEditor } from "@/app/admin/_components/MonstersEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";

function monsterImageBase(storyId: string, monsterId: string): string {
  return `/stories/${storyId}/monsters/${monsterId}`;
}

export default async function MonstersPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  if (!repo.getStory(storyId)) notFound();
  const monsters = repo.listMonsters(storyId);
  const items = repo.listItems(storyId);

  const assetMap: Record<string, string | null> = {};
  for (const m of monsters) {
    assetMap[m.id] = resolveAssetPath(monsterImageBase(storyId, m.id));
  }

  return (
    <MonstersEditor
      storyId={storyId}
      initial={monsters}
      itemCatalog={items}
      assetMap={assetMap}
    />
  );
}
