/**
 * Global medal catalog. Medals are achievements shared across every story
 * (definition is global; story-specific triggers carry their own storyId).
 * Loaded + validated once at module load — mirrors data/items.ts.
 */
import medalsJson from "@/data/global/medals.json";
import { MedalsFileSchema } from "./schemas";
import type { Medal, MedalsFile } from "@/types/story";

const parsed = MedalsFileSchema.parse(medalsJson);

export const MEDALS: MedalsFile = parsed as unknown as MedalsFile;

export function listMedals(): Medal[] {
  return MEDALS.medals;
}

export function getMedal(id: string): Medal | null {
  return MEDALS.medals.find((m) => m.id === id) ?? null;
}
