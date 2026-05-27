import { z } from "zod";
import { CompanionIdSchema } from "./primitives";

export const EncounterTriggerRequiresSchema = z.object({
  companion: CompanionIdSchema.optional(),
  item: z.string().optional(),
});

export const EncounterTriggerSchema = z.object({
  afterScene: z.string(),
  chance: z.number().min(0).max(1),
  requires: EncounterTriggerRequiresSchema.optional(),
  once: z.boolean().optional(),
});

export const EncounterIntroSchema = z.object({
  bg: z.string(),
  narration: z.string(),
});

export const EncounterRewardsSchema = z.object({
  victoryItems: z.array(z.string()).optional(),
  medalId: z.string().optional(),
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
  escape: z.string().optional(),
});

export const PatternPuzzleDefSchema = z.object({
  kind: z.literal("sequence"),
  title: z.string(),
  symbols: z.array(z.string()),
  sequence: z.array(z.number()),
});

export const StoryChoiceFailureSchema = z.object({
  outroNarration: z.string(),
  rewards: EncounterRewardsSchema.optional(),
});

export const StoryChoiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  outroNarration: z.string(),
  rewards: EncounterRewardsSchema.optional(),
  requires: EncounterTriggerRequiresSchema.optional(),
  puzzle: PatternPuzzleDefSchema.optional(),
  onFail: StoryChoiceFailureSchema.optional(),
});

export const EncounterKindSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("battle"),
    monsterIds: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("story"),
    outcome: z.literal("auto-victory").optional(),
    choices: z.array(StoryChoiceSchema).optional(),
  }),
]);

export const EncounterDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  trigger: EncounterTriggerSchema,
  intro: EncounterIntroSchema,
  body: EncounterKindSchema,
  rewards: EncounterRewardsSchema,
  outro: EncounterOutroSchema,
  displayMonsters: z.array(z.string()).optional(),
  nextSceneOnVictory: z.string().optional(),
  nextSceneOnDefeat: z.string().optional(),
});

export const EncountersFileSchema = z.object({
  encounters: z.array(EncounterDefSchema),
});

export type EncounterDefT = z.infer<typeof EncounterDefSchema>;
export type EncountersFileT = z.infer<typeof EncountersFileSchema>;
