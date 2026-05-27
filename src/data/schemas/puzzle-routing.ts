import { z } from "zod";
import { AttackerIdSchema, PuzzleKindSchema } from "./primitives";

/**
 * Which puzzle categories each attacker can solve. When a companion attacks,
 * their categories take priority over the monster's preferred kind.
 *
 * Data-driven via this schema so the admin UI can edit the routing matrix
 * without code changes.
 */

export const PuzzleRoutingSchema = z.object({
  attackerKinds: z.record(AttackerIdSchema, z.array(PuzzleKindSchema)),
});

export type PuzzleRoutingT = z.infer<typeof PuzzleRoutingSchema>;
