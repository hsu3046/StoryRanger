/**
 * Curated voice catalog. A story-agnostic list of ElevenLabs voices the admin
 * offers in the character Voice dropdown. Each entry pairs the ElevenLabs
 * `id` with a friendly, author-chosen `label` (decoupled from ElevenLabs' own
 * names so the team can rename freely). Edit src/data/global/voices.json to
 * add a voice or rename how it appears. Loaded + validated once at module
 * load — mirrors data/medals.ts.
 */
import voicesJson from "@/data/global/voices.json";
import { VoicesFileSchema, type VoiceEntryT } from "./schemas";

const parsed = VoicesFileSchema.parse(voicesJson);

export const VOICES: VoiceEntryT[] = parsed.voices;

/** Friendly label for a voice id, or the raw id if it isn't in the catalog. */
export function voiceLabel(id: string): string {
  return VOICES.find((v) => v.id === id)?.label ?? id;
}
