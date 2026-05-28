import { z } from "zod";
import { CompanionIdSchema, SpeakerIdSchema } from "./primitives";

/**
 * Story graph: Scene nodes connected by Branch edges.
 */

export const RewardSchema = z.object({
  items: z.array(z.string()).optional(),
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

export const PatternPuzzleDefSchema = z.object({
  kind: z.literal("sequence"),
  title: z.string(),
  symbols: z.array(z.string()),
  sequence: z.array(z.number()),
});

export const BranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  next: z.string(),
  addsCompanion: CompanionIdSchema.optional(),
  bgmOverride: z.string().optional(),
  /** Optional mini-puzzle. `onFailMode` controls retry vs continue.
   *  Boards are narrative only — actual rewards live on the next
   *  scene's `reward`. */
  puzzle: PatternPuzzleDefSchema.optional(),
  onFailMode: z.enum(["retry", "skip"]).optional(),
  /** Outcome narration shown AFTER the branch is taken and BEFORE
   *  navigating to the next scene. Single tap continues. */
  outcome: z.string().optional(),
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
  ending: SceneEndingSchema.optional(),
  /** One-shot reward granted on first entry to this scene. */
  reward: RewardSchema.optional(),
  /** Extra dialogue-able characters present in this scene (in addition
   *  to the party companions and the scene speaker). Use this to expose
   *  NPCs like Aunt Em on the first scene before they'd otherwise show
   *  up on the dialogue rail. */
  dialogueCharacters: z.array(SpeakerIdSchema).optional(),
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
export type RewardT = z.infer<typeof RewardSchema>;
export type PatternPuzzleDefT = z.infer<typeof PatternPuzzleDefSchema>;
