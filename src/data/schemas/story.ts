import { z } from "zod";
import {
  ChallengeCategorySchema,
  CompanionIdSchema,
  SpeakerIdSchema,
} from "./primitives";

/**
 * Story graph: Scene nodes connected by Branch edges.
 */

export const RewardSchema = z.object({
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

/** Visibility gate for a branch. Every present clause must be satisfied (AND),
 *  and each clause requires ALL of its listed ids. Absent/empty → the branch is
 *  always shown. Evaluated at render time against PlayState (no persistence). */
export const BranchConditionSchema = z.object({
  /** Player must hold ALL of these item ids in their inventory. */
  hasItems: z.array(z.string()).optional(),
  /** ALL of these companions must be in the party. */
  hasCompanions: z.array(CompanionIdSchema).optional(),
  /** ALL of these unlock keywords must be in PlayState.unlockedKeywords —
   *  earned via an ask-dialogue goal (see SceneAskSchema.unlock). */
  hasKeywords: z.array(z.string()).optional(),
});

/** Branch gate: an age-appropriate educational challenge auto-generated at
 *  runtime. `enabled` is a literal so the field is presence-toggled; `category`
 *  defaults to "auto" (pick an age-appropriate one) — authors rarely set it. */
export const BranchChallengeSchema = z.object({
  enabled: z.literal(true),
  category: z.union([z.literal("auto"), ChallengeCategorySchema]).default("auto"),
  /** How many problems the player must solve (in sequence) to pass the gate.
   *  Default 1. A wrong answer always re-rolls a fresh problem — the gate
   *  retries until solved (there is no skip / fail-out). */
  count: z.number().int().min(1).max(10).default(1),
});

export const BranchSchema = z.object({
  id: z.string(),
  label: z.string(),
  next: z.string(),
  /** Companions who JOIN the party when this branch is taken (dedup — each a
   *  no-op if already in the party). Multiple may join on one branch.
   *  (The pre-v5 singular `addsCompanion` is dropped by Zod on the next admin
   *  save; bundled content is migrated to this array form.) */
  addsCompanions: z.array(CompanionIdSchema).optional(),
  /** Companions who LEAVE the party when this branch is taken (parting
   *  moment). Multiple may leave on one branch. Their mood + HP are kept, so
   *  re-joining later restores them. */
  removesCompanions: z.array(CompanionIdSchema).optional(),
  /** Optional visibility gate — the branch only appears as a choice when the
   *  condition is met (e.g. holds an item, has a companion). */
  condition: BranchConditionSchema.optional(),
  /** Optional educational challenge gate. When enabled, an age-appropriate
   *  math problem must be solved to take the branch (a wrong answer always
   *  retries with a fresh problem — no skip).
   *  (The pre-v4 hand-authored `puzzle` field + the old `onFailMode` toggle are
   *  no longer in the schema; any legacy value is dropped by Zod on the next
   *  admin save. No bundled content depends on them.) */
  challenge: BranchChallengeSchema.optional(),
  /** Outcome narration shown AFTER the branch is taken and BEFORE
   *  navigating to the next scene. Single tap continues. */
  outcome: z.string().optional(),
});

export const SceneEndingSchema = z.object({
  id: z.string(),
  label: z.string(),
});

/** An authored "ask" question shown in the choice area. `characterId` must
 *  reference a persona-bearing character (validated softly at author time
 *  + runtime; the dialogue route 400s otherwise). */
export const SceneAskSchema = z.object({
  id: z.string(),
  label: z.string(),
  characterId: SpeakerIdSchema,
  /** Optional branch-unlock. When the child meets `goal` (judged per-turn by
   *  the dialogue LLM during this ask's conversation), `keyword` is added to
   *  PlayState.unlockedKeywords; a branch gated on it (condition.hasKeywords)
   *  then appears. Both fields required together when present. */
  unlock: z
    .object({
      keyword: z.string().min(1),
      goal: z.string().min(1),
    })
    .optional(),
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
  /** Authored "ask" questions surfaced as chips in the choice area. */
  asks: z.array(SceneAskSchema).optional(),
});

export const StorySchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Optional subtitle / tagline — shown under the title on the home
   *  card and cover screens. Existing stories without this field are
   *  still valid; the player UI falls back to title-only. */
  subtitle: z.string().optional(),
  language: z.string(),
  estimatedMinutes: z.number(),
  coverImage: z.string(),
  startScene: z.string(),
  scenes: z.record(z.string(), SceneSchema),
});

export type StoryT = z.infer<typeof StorySchema>;
export type SceneT = z.infer<typeof SceneSchema>;
export type BranchT = z.infer<typeof BranchSchema>;
export type BranchConditionT = z.infer<typeof BranchConditionSchema>;
export type BranchChallengeT = z.infer<typeof BranchChallengeSchema>;
export type SceneAskT = z.infer<typeof SceneAskSchema>;
export type RewardT = z.infer<typeof RewardSchema>;
