import { HomeOnboarding, type StoryCardMeta } from "@/components/home/HomeOnboarding";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { contentRepo } from "@/lib/content-repo";
import { getProfile, getSessionUser, ensureProfile } from "@/lib/supabase/queries";

export default async function HomePage() {
  // Resolve the signed-in user FIRST. When Supabase isn't configured yet (env
  // absent) getSessionUser throws → null, so the home renders as a plain
  // anonymous page with NO sign-out control. Only fetch/create the profile —
  // and only show AuthStatus — when there's an actual session. (Defensively
  // create the profile if the auth-callback creation missed.)
  const user = await getSessionUser().catch(() => null);
  let profile = user ? await getProfile().catch(() => null) : null;
  if (user && !profile) profile = await ensureProfile(user).catch(() => null);
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

  return (
    <>
      <HomeOnboarding stories={stories} initialHero={profile?.hero ?? null} />
      {user && <AuthStatus displayName={profile?.display_name ?? null} />}
    </>
  );
}
