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
  if (!repo.getStory(storyId)) notFound();
  const items = repo.listItems(storyId);
  const { missing } = scanItemReferences(storyId);

  return (
    <ItemsEditor
      storyId={storyId}
      initial={items}
      missingRefs={missing}
    />
  );
}
