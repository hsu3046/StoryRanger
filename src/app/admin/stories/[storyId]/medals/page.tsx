import { notFound } from "next/navigation";

import { contentRepo } from "@/lib/content-repo";
import { MedalsEditor } from "@/app/admin/_components/MedalsEditor";

export default async function MedalsPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  const loaded = repo.getStory(storyId);
  if (!loaded) notFound();

  return (
    <MedalsEditor
      storyId={storyId}
      storyTitle={loaded.story.title}
      initial={loaded.medals.medals}
    />
  );
}
