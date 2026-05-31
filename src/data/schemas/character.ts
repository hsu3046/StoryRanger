import { z } from "zod";
import { SPEED_MIN, SPEED_MAX } from "@/lib/tts-config";
import {
  SpeakerIdSchema,
  SpriteSizeSchema,
  TtsVoiceSchema,
} from "./primitives";

/**
 * Editable dialogue persona — the descriptive half of the LLM system
 * prompt for the interactive character-chat feature. The character's
 * `name` (displayName) and `id` are supplied separately; this object
 * carries only the per-character behavioural content the admin tunes.
 *
 * Kept as a STATIC block in the system prompt (no hero/scene/mood values)
 * so the prompt prefix stays identical across requests and is eligible
 * for provider prompt-caching.
 */
export const CharacterPersonaSchema = z.object({
  /** Who this character is — 1-3 sentences. */
  shortBio: z.string(),
  /** How they talk — cadence, quirks, vocabulary. */
  speechStyle: z.string(),
  /** One-line summary of vocal feel. */
  voiceTraits: z.string(),
  /** Positive behavioural guidelines. */
  dos: z.array(z.string()).default([]),
  /** Things the character must never do. */
  donts: z.array(z.string()).default([]),
  /** Item ids this character may gift at very high mood (one per
   *  character per playthrough — see the dialogue route's hard gate). */
  giftableItems: z.array(z.string()).default([]),
});

export const CharacterSchema = z.object({
  id: SpeakerIdSchema,
  name: z.string(),
  /** Marks the story's protagonist. The hero is special: the player names
   *  them in-game (so `name` here is only a default/fallback), they have no
   *  dialogue persona (you don't chat with yourself), and their sprite lives
   *  at `characters/hero.*`. At most one character per story should set this.
   *  (Phase A: admin-facing source of truth; runtime still keys on the
   *  "dorothy" speaker id.) */
  isHero: z.boolean().optional(),
  voice: TtsVoiceSchema,
  // ElevenLabs speed range (see clampSpeed) — out-of-range values 422.
  voiceSpeed: z.number().min(SPEED_MIN).max(SPEED_MAX),
  color: z.string(), // hex
  /** Display size on the stage — drives the SpriteLayer height the same
   *  way as monsters. Lion / Wizard typically read as "large", Toto is
   *  "tiny", everyone else "medium". */
  size: SpriteSizeSchema,
  /** Optional interactive-dialogue persona. Present only for characters
   *  the player can talk with (companions + story NPCs). Omit for
   *  narrator / hero. */
  persona: CharacterPersonaSchema.optional(),
  /** Optional override of the in-scene sprite path. Stored as a base
   *  path without extension (e.g. `/stories/wizard-of-oz/characters/
   *  alt-scarecrow`); AssetThumb / runtime extension fallback resolves
   *  the file. Omit to use the id-based convention (`characters/<id>`). */
  image: z.string().optional(),
  /** Optional override of the dialogue head-shot (`/dialogue/<id>`), used in
   *  the conversation rail + admin chips. Extensionless base. Omit for the
   *  id-based convention. */
  dialogueImage: z.string().optional(),
  /** Optional override of the battle-stance art (`/characters/battle/<id>`).
   *  Extensionless base. Omit for the id-based convention. */
  battleImage: z.string().optional(),
});

export const CharactersFileSchema = z.object({
  characters: z.array(CharacterSchema),
});

export type CharacterPersonaT = z.infer<typeof CharacterPersonaSchema>;
export type CharacterT = z.infer<typeof CharacterSchema>;
export type CharactersFileT = z.infer<typeof CharactersFileSchema>;
