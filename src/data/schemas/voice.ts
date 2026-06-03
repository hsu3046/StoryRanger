import { z } from "zod";

/**
 * A single entry in the curated voice catalog (src/data/global/voices.json).
 * `id` is the ElevenLabs voice id used for TTS. `name` is a short, author-chosen
 * display name shown in the admin Voice dropdown (decoupled from ElevenLabs'
 * own names). `tags` make voices searchable/filterable as the catalog grows.
 *
 * Tag convention (free-form + extensible, stored as lowercase tokens WITHOUT a
 * leading "#" — the UI adds the "#"):
 *   - age:    young | adult | elder
 *   - tone:   warm | bright | calm | dark
 *   - gender: male | female | neutral
 *   - feature (optional, open-ended): evil, fairy, monster, robot, narrator, …
 */
export const VoiceEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
});

export const VoicesFileSchema = z.object({
  voices: z.array(VoiceEntrySchema),
});

export type VoiceEntryT = z.infer<typeof VoiceEntrySchema>;
export type VoicesFileT = z.infer<typeof VoicesFileSchema>;
