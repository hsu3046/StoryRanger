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

/** Educational challenge categories (math-first). One generator produces
 *  problems in these categories, age-tiered. `"auto"` (used in authoring) is
 *  NOT a category — it means "pick an age-appropriate one at runtime". */
export const ChallengeCategorySchema = z.enum([
  "add",
  "sub",
  "multiply",
  "divide",
  "missing",
  "compare",
  "counting",
  "pattern",
  "geometry",
  "fraction",
  "word",
  "odd-one-out",
]);

export const TtsVoiceSchema = z.enum([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
]);
