import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { StoryBasicEditor } from "@/app/admin/_components/StoryBasicEditor";
import type { StoryT } from "@/data/schemas";

const IMAGE_EXTS = new Set([".webp", ".png", ".jpeg", ".jpg"]);

/** Scan the story's public folder for any image asset the author might
 *  want to pick as the cover. Returns full paths (relative to the site
 *  root) so they can be stored verbatim on `story.coverImage`. */
async function listCoverCandidates(storyId: string): Promise<string[]> {
  const dir = path.join(process.cwd(), "public", "stories", storyId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const found = new Set<string>();
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const stem = e.name.slice(0, -ext.length);
      found.add(`/stories/${storyId}/${stem}`);
    }
    return [...found].sort();
  } catch {
    return [];
  }
}

export default async function StoryBasicPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();

  const coverOptions = (await listCoverCandidates(storyId)).map((path) => ({
    value: path,
    // Display only the filename — same convention as the Scene image
    // picker in the graph editor.
    label: path.split("/").pop() ?? path,
  }));

  return (
    <StoryBasicEditor
      storyId={storyId}
      initialStory={loaded.story as StoryT}
      coverOptions={coverOptions}
    />
  );
}
