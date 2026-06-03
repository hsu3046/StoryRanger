/**
 * Curated voice catalog. A story-agnostic list of ElevenLabs voices the admin
 * offers in the character Voice dropdown. Each entry pairs the ElevenLabs `id`
 * with a short author-chosen `name` (decoupled from ElevenLabs' own names) and
 * searchable `tags` (age / tone / gender / feature — see VoiceEntrySchema).
 * Edit src/data/global/voices.json to add a voice, rename it, or re-tag it.
 * Loaded + validated once at module load — mirrors data/medals.ts.
 */
import voicesJson from "@/data/global/voices.json";
import { VoicesFileSchema, type VoiceEntryT } from "./schemas";

const parsed = VoicesFileSchema.parse(voicesJson);

export const VOICES: VoiceEntryT[] = parsed.voices;

/** Display name for a voice id, or the raw id if it isn't in the catalog. */
export function voiceName(id: string): string {
  return VOICES.find((v) => v.id === id)?.name ?? id;
}

/** Tags for a voice id (empty if not in the catalog). */
export function voiceTags(id: string): string[] {
  return VOICES.find((v) => v.id === id)?.tags ?? [];
}
