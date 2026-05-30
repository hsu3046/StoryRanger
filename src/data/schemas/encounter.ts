import { z } from "zod";
import { CompanionIdSchema } from "./primitives";

export const EncounterTriggerRequiresSchema = z.object({
  companion: CompanionIdSchema.optional(),
  item: z.string().optional(),
});

export const EncounterTriggerSchema = z.object({
  /** Source scene the branch originates from. */
  sceneId: z.string(),
  /** Branch id within `sceneId` that, when traversed, may roll this
   *  encounter. */
  branchId: z.string(),
  /** How many copies of this battle to drop into the shuffle pool when
   *  the branch is taken. Default 1. The pool is shuffled and consumed
   *  in order before the destination scene's narration shows. */
  count: z.number().int().min(1).optional(),
  requires: EncounterTriggerRequiresSchema.optional(),
});

export const EncounterIntroSchema = z.object({
  bg: z.string(),
});

export const EncounterRewardsSchema = z.object({
  /** Encounter-level drop items granted on victory, IN ADDITION to each
   *  monster's own `drops`. Optional — omit for monster-drops-only. */
  items: z.array(z.string()).optional(),
  moodBoost: z
    .array(
      z.object({
        companionId: CompanionIdSchema,
        delta: z.number(),
      }),
    )
    .optional(),
});

export const EncounterOutroSchema = z.object({
  victory: z.string(),
  defeat: z.string().optional(),
});

export const EncounterDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  trigger: EncounterTriggerSchema,
  intro: EncounterIntroSchema,
  body: z.object({
    kind: z.literal("battle"),
    monsterIds: z.array(z.string()),
  }),
  rewards: EncounterRewardsSchema,
  outro: EncounterOutroSchema,
  displayMonsters: z.array(z.string()).optional(),
});

export const EncountersFileSchema = z.object({
  encounters: z.array(EncounterDefSchema),
});

export type EncounterDefT = z.infer<typeof EncounterDefSchema>;
export type EncountersFileT = z.infer<typeof EncountersFileSchema>;
