import { z } from "zod";

/**
 * A single entry in the curated voice catalog (src/data/global/voices.json).
 * `id` is the ElevenLabs voice id used for TTS; `label` is the friendly,
 * author-chosen display name shown in the admin Voice dropdown (intentionally
 * decoupled from ElevenLabs' own voice names so the team can rename freely).
 */
export const VoiceEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const VoicesFileSchema = z.object({
  voices: z.array(VoiceEntrySchema),
});

export type VoiceEntryT = z.infer<typeof VoiceEntrySchema>;
export type VoicesFileT = z.infer<typeof VoicesFileSchema>;
