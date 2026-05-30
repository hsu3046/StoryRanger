import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { CharactersEditor } from "@/app/admin/_components/CharactersEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";
import { characterAssetSlug } from "@/lib/narrative";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);

/** Scan /public/stories/<id>/characters/ for image stems so the editor
 *  can offer them as override options. Mirrors the Scene image picker
 *  scan in graph/page.tsx. */
async function listCharacterImageStems(storyId: string): Promise<string[]> {
  const dir = path.join(
    process.cwd(),
    "public",
    "stories",
    storyId,
    "characters",
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
  const heroId = characters.find((c) => c.isHero)?.id ?? "dorothy";
  const assetMap: Record<string, string | null> = {};
  for (const c of characters) {
    const base =
      c.image ??
      `/stories/${storyId}/characters/${characterAssetSlug(c.id, heroId)}`;
    assetMap[c.id] = resolveAssetPath(base);
  }

  const imageOptions = (await listCharacterImageStems(storyId)).map((stem) => ({
    value: `/stories/${storyId}/characters/${stem}`,
    label: stem,
  }));

  return (
    <CharactersEditor
      storyId={storyId}
      storyTitle={loaded.story.title}
      initial={characters}
      assetMap={assetMap}
      imageOptions={imageOptions}
      itemCatalog={repo.listItems(storyId)}
    />
  );
}
