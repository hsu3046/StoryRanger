import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo, scanCharacterReferences } from "@/lib/content-repo";
import { CharactersEditor } from "@/app/admin/_components/CharactersEditor";
import { resolveAssetPath } from "@/app/admin/_lib/resolveAsset";
import { characterAssetSlug } from "@/lib/narrative";
import { storyAssetId } from "@/lib/asset-paths";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);

/** Scan /public/stories/<id>/<...subdir> for image stems so the editor can
 *  offer them as override options. Mirrors the Scene image picker scan in
 *  graph/page.tsx. Returns `{ value: web-path-without-ext, label: stem }`. */
async function listImageOptions(
  storyId: string,
  subdir: string[],
): Promise<{ value: string; label: string }[]> {
  const dir = path.join(process.cwd(), "public", "stories", storyId, ...subdir);
  const webBase = `/stories/${storyId}/${subdir.join("/")}`;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const stems = new Set<string>();
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      stems.add(e.name.slice(0, -ext.length));
    }
    return [...stems]
      .sort()
      .map((stem) => ({ value: `${webBase}/${stem}`, label: stem }));
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
  // Duplicated stories share their source's media — scans + derived display
  // bases walk the ASSET id's folder (identical for non-duplicates).
  const assetId = storyAssetId(loaded.story);

  // Server-side pre-resolve each portrait so the browser never flickers
  // through onError fallback. `null` → no file on disk; render placeholder
  // immediately.
  const heroId = characters.find((c) => c.isHero)?.id ?? "dorothy";
  const assetMap: Record<string, string | null> = {};
  for (const c of characters) {
    const base =
      c.image ??
      `/stories/${assetId}/characters/${characterAssetSlug(c.id, heroId)}`;
    assetMap[c.id] = resolveAssetPath(base);
  }

  // One picker per artistic intent: in-scene sprite, dialogue head-shot,
  // battle stance — each scanned from its own folder.
  const [imageOptions, dialogueImageOptions, battleImageOptions] =
    await Promise.all([
      listImageOptions(assetId, ["characters"]),
      listImageOptions(assetId, ["dialogue"]),
      listImageOptions(assetId, ["characters", "battle"]),
    ]);

  return (
    <CharactersEditor
      storyId={storyId}
      assetStoryId={assetId}
      storyTitle={loaded.story.title}
      initial={characters}
      assetMap={assetMap}
      imageOptions={imageOptions}
      dialogueImageOptions={dialogueImageOptions}
      battleImageOptions={battleImageOptions}
      itemCatalog={repo.listItems(storyId)}
      missingRefs={scanCharacterReferences(storyId).missing}
    />
  );
}
