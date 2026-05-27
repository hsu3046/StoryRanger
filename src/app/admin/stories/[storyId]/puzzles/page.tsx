import { notFound } from "next/navigation";
import path from "node:path";
import { promises as fs } from "node:fs";

import { contentRepo } from "@/lib/content-repo";
import { PuzzleRoutingEditor } from "@/app/admin/_components/PuzzleRoutingEditor";
import { PuzzleRoutingSchema } from "@/data/schemas";

export default async function PuzzlesPage({
  params,
}: {
  params: Promise<{ storyId: string }>;
}) {
  const { storyId } = await params;
  const repo = contentRepo();
  if (!repo.getStory(storyId)) notFound();

  const filePath = path.join(
    process.cwd(),
    "src",
    "stories",
    storyId,
    "puzzle-routing.json",
  );
  const raw = await fs.readFile(filePath, "utf-8");
  const routing = PuzzleRoutingSchema.parse(JSON.parse(raw));

  return <PuzzleRoutingEditor storyId={storyId} initial={routing} />;
}
