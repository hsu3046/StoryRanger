import { z } from "zod";
import {
  SpeakerIdSchema,
  SpriteSizeSchema,
  TtsVoiceSchema,
} from "./primitives";

export const CharacterSchema = z.object({
  id: SpeakerIdSchema,
  name: z.string(),
  voice: TtsVoiceSchema,
  voiceSpeed: z.number().min(0.25).max(4.0),
  color: z.string(), // hex
  /** Display size on the stage — drives the SpriteLayer height the same
   *  way as monsters. Lion / Wizard typically read as "large", Toto is
   *  "tiny", everyone else "medium". */
  size: SpriteSizeSchema,
});

export const CharactersFileSchema = z.object({
  characters: z.array(CharacterSchema),
});

export type CharacterT = z.infer<typeof CharacterSchema>;
export type CharactersFileT = z.infer<typeof CharactersFileSchema>;
