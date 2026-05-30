import { z } from "zod";
import { AttackerIdSchema, PuzzleKindSchema } from "./primitives";

/**
 * Puzzle routing + generator parameters.
 *
 * - `attackerKinds`: which puzzle categories each attacker draws from.
 * - `generators`: per-kind ranges / spreads that drive the actual numbers
 *   in the question. Editing these lets authors tune difficulty without
 *   touching `puzzle.ts`. All entries are optional — anything missing
 *   falls back to the hardcoded defaults inside `puzzle.ts`.
 */

const PositiveInt = z.number().int().min(0);
const PositiveSpread = z.number().int().min(1);

const NumericRangeGenSchema = z.object({
  min: PositiveInt,
  max: PositiveInt,
  spread: PositiveSpread,
});

const MultiplyGenSchema = z.object({
  aMin: PositiveInt.min(1),
  aMax: PositiveInt.min(1),
  bMin: PositiveInt.min(1),
  bMax: PositiveInt.min(1),
  spread: PositiveSpread,
});

const PatternGenSchema = z.object({
  startMin: PositiveInt,
  startMax: PositiveInt,
  /** Step choices — picked uniformly per puzzle. List can repeat values to
   *  bias toward common steps (e.g. `[1, 2, 2, 3, 5]` makes step=2 twice
   *  as likely). */
  steps: z.array(z.number().int().min(1)).min(1),
  spread: PositiveSpread,
});

const OddOutGenSchema = z.object({
  /** Numbers are randInt(1, max)*2 (even) or *2+1 (odd). */
  max: PositiveInt.min(1),
});

const BiggerGenSchema = z.object({
  min: PositiveInt,
  max: PositiveInt,
});

const MissingGenSchema = z.object({
  ansMin: PositiveInt,
  ansMax: PositiveInt,
  addMin: PositiveInt,
  addMax: PositiveInt,
  spread: PositiveSpread,
});

export const PuzzleGeneratorsSchema = z.object({
  "add-1d": NumericRangeGenSchema.optional(),
  "sub-1d": NumericRangeGenSchema.optional(),
  "add-2d": NumericRangeGenSchema.optional(),
  multiply: MultiplyGenSchema.optional(),
  pattern: PatternGenSchema.optional(),
  "odd-out": OddOutGenSchema.optional(),
  bigger: BiggerGenSchema.optional(),
  missing: MissingGenSchema.optional(),
});

export const PuzzleRoutingSchema = z.object({
  attackerKinds: z.record(AttackerIdSchema, z.array(PuzzleKindSchema)),
  generators: PuzzleGeneratorsSchema.optional(),
});

export type PuzzleRoutingT = z.infer<typeof PuzzleRoutingSchema>;
export type PuzzleGeneratorsT = z.infer<typeof PuzzleGeneratorsSchema>;
export type NumericRangeGenT = z.infer<typeof NumericRangeGenSchema>;
export type MultiplyGenT = z.infer<typeof MultiplyGenSchema>;
export type PatternGenT = z.infer<typeof PatternGenSchema>;
export type OddOutGenT = z.infer<typeof OddOutGenSchema>;
export type BiggerGenT = z.infer<typeof BiggerGenSchema>;
export type MissingGenT = z.infer<typeof MissingGenSchema>;
