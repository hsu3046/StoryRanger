import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { StoryGraphEditor } from "@/app/admin/_components/graph/StoryGraphEditor";
import type { EncounterDefT, StoryT } from "@/data/schemas";

export default async function GraphPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();

  return (
    <StoryGraphEditor
      storyId={storyId}
      initialStory={loaded.story as StoryT}
      initialEncounters={repo.listEncounters(storyId) as EncounterDefT[]}
      monsters={repo.listMonsters(storyId)}
      items={repo.listItems(storyId)}
      backgrounds={repo.listBackgrounds(storyId)}
    />
  );
}
