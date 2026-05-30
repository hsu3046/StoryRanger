import { contentRepo } from "@/lib/content-repo";
import { listMedals } from "@/data/medals";
import { MedalsEditor } from "@/app/admin/_components/MedalsEditor";

/**
 * Medals is a GLOBAL achievement catalog shared by every story. Triggers
 * carry their own storyId, so the editor offers a story picker per trigger.
 */
export default function MedalsPage() {
  const repo = contentRepo();
  const stories = repo.listStoryIds().map((id) => ({
    id,
    title: repo.getStory(id)?.story.title ?? id,
  }));

  return <MedalsEditor initial={listMedals()} stories={stories} />;
}
