/**
 * Shared primitives for content schemas. Single source of allowed literals.
 */

import { z } from "zod";

/** Speaker ids known to the bundled stories. Speaker ids are OPEN (any
 *  non-empty string) so new stories can introduce their own characters —
 *  this list is kept only for admin convenience (starter options /
 *  autocomplete) and for documenting the originals. */
export const KNOWN_SPEAKER_IDS = [
  "narrator",
  "dorothy",
  "scarecrow",
  "tinman",
  "lion",
  "wicked-witch",
  "glinda",
  "wizard",
  "aunt-em",
  "toto",
] as const;

export const SpeakerIdSchema = z.string().min(1);

export const CompanionIdSchema = z.enum(["scarecrow", "tinman", "lion"]);

export const AttackerIdSchema = z.enum(["hero", "scarecrow", "tinman", "lion"]);

export const SpriteSizeSchema = z.enum([
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
]);

export const PuzzleKindSchema = z.enum([
  "add-1d",
  "sub-1d",
  "add-2d",
  "multiply",
  "pattern",
  "odd-out",
  "bigger",
  "missing",
]);

/** A monster's puzzle preference: any concrete kind, or `"random"` which
 *  picks a fresh kind on each hero attack. Kept separate from
 *  `PuzzleKindSchema` because the puzzle-routing matrix (attacker → kinds)
 *  must only contain concrete kinds. */
export const MonsterPuzzleKindSchema = z.enum([
  "add-1d",
  "sub-1d",
  "add-2d",
  "multiply",
  "pattern",
  "odd-out",
  "bigger",
  "missing",
  "random",
]);

export const TtsVoiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);
