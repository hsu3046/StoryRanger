import { HomeOnboarding, type StoryCardMeta } from "@/components/home/HomeOnboarding";
import { contentRepo } from "@/lib/content-repo";

export default function HomePage() {
  const repo = contentRepo();
  // Source-of-truth for the carousel is now the same scenes.json each
  // admin Basic page edits — title + subtitle propagate immediately.
  const stories: StoryCardMeta[] = repo
    .listStoryIds()
    .map((id) => {
      const loaded = repo.getStory(id);
      if (!loaded) return null;
      // CoverImage prefers a base path (no extension) so it can fall back
      // through .webp / .png / .jpeg / .jpg. Strip any extension that
      // happens to be on `story.coverImage`.
      const coverBase = loaded.story.coverImage.replace(/\.[^./]+$/, "");
      return {
        id: loaded.story.id,
        title: loaded.story.title,
        subtitle: loaded.story.subtitle ?? "",
        coverBase,
      } satisfies StoryCardMeta;
    })
    .filter((s): s is StoryCardMeta => s !== null);

  return <HomeOnboarding stories={stories} />;
}
