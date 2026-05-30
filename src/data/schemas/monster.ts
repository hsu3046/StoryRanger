import { z } from "zod";
import { SpriteSizeSchema } from "./primitives";

export const MonsterTypeSchema = z.enum(["hostile", "neutral", "friendly"]);

export const MonsterStatsSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: MonsterTypeSchema,
  hits: z.number().min(0).max(20),
  drops: z.array(z.string()).optional(),
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

export type MonsterStatsT = z.infer<typeof MonsterStatsSchema>;
export type MonstersFileT = z.infer<typeof MonstersFileSchema>;
