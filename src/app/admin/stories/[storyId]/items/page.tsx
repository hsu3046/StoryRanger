import { notFound } from "next/navigation";

import { contentRepo, scanItemReferences } from "@/lib/content-repo";
import { ItemsEditor } from "@/app/admin/_components/ItemsEditor";

export default async function ItemsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();
  const items = repo.listItems(storyId);
  const { missing } = scanItemReferences(storyId);

  return (
    <ItemsEditor
      storyId={storyId}
      storyTitle={loaded.story.title}
      initial={items}
      missingRefs={missing}
    />
  );
}
