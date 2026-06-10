import { z } from "zod";
import { SpriteSizeSchema } from "./primitives";

/**
 * A single drop. Back-compatible union:
 *   - a plain item id string → always dropped (100%)
 *   - `{ item, chance }`      → dropped with `chance` percent probability (1–100)
 * Existing `drops: string[]` data needs no migration (plain string = 100%).
 */
export const MonsterDropSchema = z.union([
  z.string().min(1),
  z.object({
    item: z.string().min(1),
    /** Drop chance in percent, 1–100. */
    chance: z.number().int().min(1).max(100),
  }),
]);

export const MonsterStatsSchema = z.object({
  // Non-empty: an empty id breaks asset paths (`…/monsters/`), drop /
  // encounter references, and catalog map keys. SpeakerIdSchema already
  // enforces this for characters — keep the catalogs consistent.
  id: z.string().min(1),
  name: z.string(),
  // ≥ 1: a 0-hit monster can't be fought — it spawns pre-defeated and (before
  // the engine-side guard) could softlock the battle. Reject at authoring time.
  hits: z.number().int().min(1).max(20),
  drops: z.array(MonsterDropSchema).optional(),
  size: SpriteSizeSchema,
  airborne: z.boolean().optional(),
  notes: z.string().optional(),
  /** Optional sprite path override (extensionless base). Omit to use
   *  the id-based convention `/stories/<id>/monsters/<monsterId>`. */
  image: z.string().optional(),
});

export const MonstersFileSchema = z.object({
  monsters: z.array(MonsterStatsSchema),
});

export type MonsterDropT = z.infer<typeof MonsterDropSchema>;
export type MonsterStatsT = z.infer<typeof MonsterStatsSchema>;
export type MonstersFileT = z.infer<typeof MonstersFileSchema>;
