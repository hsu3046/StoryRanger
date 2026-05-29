import { notFound } from "next/navigation";
import { getStory } from "@/lib/stories";
import { MEDALS } from "@/data/medals";
import { StoryPlayer } from "@/components/play/StoryPlayer";

interface Props {
  params: Promise<{ storyId: string }>;
}

export default async function PlayPage({ params }: Props) {
  const { storyId } = await params;
  const loaded = getStory(storyId);
  if (!loaded) notFound();
  return (
    <StoryPlayer
      story={loaded.story}
      medals={MEDALS}
      characters={loaded.characters}
    />
  );
}
