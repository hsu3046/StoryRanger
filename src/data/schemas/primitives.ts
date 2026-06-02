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
  // Early / number sense (younger ages)
  "counting",
  "shape",
  "compare",
  "odd-one-out",
  "pattern",
  // Arithmetic
  "add",
  "sub",
  "multiply",
  "divide",
  "missing",
  // Singapore-curriculum topics (scale by age tier)
  "fraction",
  "decimal",
  "percentage",
  "ratio",
  "money",
  "time",
  "measure", // area / perimeter / volume
  "geometry", // shape sides / angles
  "average",
  "factors", // factors & multiples
  "algebra",
  "speed",
  "word", // word / heuristic problems
  // English literacy (offline word-bank; author-gated only — NOT in the math
  // AGE_PLAN, so battles + "auto" stay math). See src/data/english-bank.ts.
  "vocab-picture", // emoji → which word
  "first-letter", // phonics: starting letter / which word starts with X
  "rhyme",
  "syllables", // phonological awareness: clap the beats
  "missing-letter", // fill the blank (c _ t)
  "spelling", // pick the correct spelling for the picture
  "plural", // grammar: one cat → two cats / irregulars
  "compound", // word-building: rain + bow = rainbow
  "homophone", // same sound, different word (see / sea)
  "opposite", // antonyms
  "synonym", // words that mean the same (upper grades)
  "analogy", // word relationships (big:small :: hot:cold)
  // Logic / computational-thinking (pseudo-programming + algorithm basics;
  // all NON-numeric — author-gated, never in math "auto"/battles unless picked).
  "sequence", // order the steps of an algorithm
  "commands", // run a 1-D instruction list (where does the robot land?)
  "loop", // repeat / iteration
  "conditional", // if / else branching
  "trace", // execute + predict (which way are you facing?)
  "debug", // find the wrong step
  "boolean", // AND / OR / NOT logic gates
]);

/** ElevenLabs voice id (e.g. "21m00Tcm4TlvDq8ikWAM"). Free-form because the
 *  Voice Library has thousands; authors pick one per character in the admin. */
export const TtsVoiceSchema = z.string().min(1);
