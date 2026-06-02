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

export const EncounterDefSchema = z.object({
  id: z.string(),
  trigger: EncounterTriggerSchema,
  intro: EncounterIntroSchema,
  body: z.object({
    kind: z.literal("battle"),
    monsterIds: z.array(z.string()),
  }),
  rewards: EncounterRewardsSchema,
  displayMonsters: z.array(z.string()).optional(),
  /** Subject the in-battle problems are drawn from. Default "mixed". */
  challengeType: z
    .enum(["mixed", "math", "english", "logic"])
    .default("mixed"),
});

export const EncountersFileSchema = z.object({
  encounters: z.array(EncounterDefSchema),
});

export type EncounterDefT = z.infer<typeof EncounterDefSchema>;
export type EncountersFileT = z.infer<typeof EncountersFileSchema>;
