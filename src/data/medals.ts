/**
 * Global medal catalog. Medals are achievements shared across every story,
 * earned automatically once a play metric (friends made, battles cleared, …)
 * reaches its threshold. Loaded + validated once at module load — mirrors
 * data/items.ts.
 */
import medalsJson from "@/data/global/medals.json";
import { MedalsFileSchema } from "./schemas";
import type { Medal, MedalsFile } from "@/types/story";

const parsed = MedalsFileSchema.parse(medalsJson);

export const MEDALS: MedalsFile = parsed as unknown as MedalsFile;

export function listMedals(): Medal[] {
  return MEDALS.medals;
}
