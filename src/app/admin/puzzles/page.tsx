import path from "node:path";
import { promises as fs } from "node:fs";

import { PuzzleRoutingEditor } from "@/app/admin/_components/PuzzleRoutingEditor";
import { PuzzleRoutingSchema } from "@/data/schemas";

/**
 * Puzzles & Quizzes is GLOBAL — one routing config shared by every story.
 * Reads src/data/global/puzzle-routing.json.
 */
export default async function PuzzlesPage() {
  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "global",
    "puzzle-routing.json",
  );
  const raw = await fs.readFile(filePath, "utf-8");
  const routing = PuzzleRoutingSchema.parse(JSON.parse(raw));

  return <PuzzleRoutingEditor initial={routing} />;
}
