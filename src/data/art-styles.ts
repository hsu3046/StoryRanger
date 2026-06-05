/**
 * Curated art-style template gallery. A story-agnostic list of looks the admin
 * offers in the Concept step's Art Style picker. Each entry pairs an author-
 * chosen `name` + sample `image` (selection UI only) with the `prompt` text that
 * is injected verbatim into every illustration prompt for visual consistency.
 * Edit src/data/global/art-styles.json to add a style, rename it, or re-prompt
 * it; drop the matching sample image under public/image/style/. Loaded +
 * validated once at module load — mirrors data/voices.ts.
 */
import artStylesJson from "@/data/global/art-styles.json";
import { ArtStylesFileSchema, type ArtStyleTemplateT } from "./schemas";

const parsed = ArtStylesFileSchema.parse(artStylesJson);

export const ART_STYLES: ArtStyleTemplateT[] = parsed.styles;

/** The style prompt for a template id, or "" if it isn't in the catalog. */
export function artStylePromptOf(id: string): string {
  return ART_STYLES.find((s) => s.id === id)?.prompt ?? "";
}
