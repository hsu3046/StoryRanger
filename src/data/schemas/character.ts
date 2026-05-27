import { z } from "zod";
import { SpeakerIdSchema, TtsVoiceSchema } from "./primitives";

export const CharacterSchema = z.object({
  id: SpeakerIdSchema,
  name: z.string(),
  voice: TtsVoiceSchema,
  voiceSpeed: z.number().min(0.25).max(4.0),
  color: z.string(), // hex
});

export const CharactersFileSchema = z.object({
  characters: z.array(CharacterSchema),
});

export type CharacterT = z.infer<typeof CharacterSchema>;
export type CharactersFileT = z.infer<typeof CharactersFileSchema>;
