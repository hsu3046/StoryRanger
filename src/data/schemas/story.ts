import { z } from "zod";
import { CompanionIdSchema, SpeakerIdSchema } from "./primitives";

/**
 * Story graph: Scene nodes connected by Branch edges.
 */

export const BranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  next: z.string(),
  medalTrigger: z.string().nullable().optional(),
  addsCompanion: CompanionIdSchema.optional(),
  bgmOverride: z.string().optional(),
});

export const SceneEndingSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const SceneSchema = z.object({
  image: z.string(),
  bgm: z.string(),
  speaker: SpeakerIdSchema,
  narration: z.string(),
  branches: z.array(BranchSchema),
  allowFreeInput: z.boolean().optional(),
  freeInputHint: z.string().optional(),
  ending: SceneEndingSchema.optional(),
});

export const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  language: z.string(),
  ageRange: z.tuple([z.number(), z.number()]),
  estimatedMinutes: z.number(),
  coverImage: z.string(),
  startScene: z.string(),
  scenes: z.record(z.string(), SceneSchema),
});

export type StoryT = z.infer<typeof StorySchema>;
export type SceneT = z.infer<typeof SceneSchema>;
export type BranchT = z.infer<typeof BranchSchema>;
