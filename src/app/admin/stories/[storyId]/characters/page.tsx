import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { CharactersEditor } from "@/app/admin/_components/CharactersEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";

function characterImageBase(storyId: string, charId: string): string {
  const filename = charId === "dorothy" ? "hero" : charId;
  return `/stories/${storyId}/characters/${filename}`;
}

export default async function CharactersPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();
  const characters = loaded.characters.characters;

  // Server-side pre-resolve each portrait so the browser never flickers
  // through onError fallback. `null` → no file on disk; render placeholder
  // immediately.
  const assetMap: Record<string, string | null> = {};
  for (const c of characters) {
    assetMap[c.id] = resolveAssetPath(characterImageBase(storyId, c.id));
  }

  return (
    <CharactersEditor
      storyId={storyId}
      initial={characters}
      assetMap={assetMap}
    />
  );
}
