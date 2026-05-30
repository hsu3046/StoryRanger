import { z } from "zod";

/**
 * Medal trigger — when this medal is awarded.
 */
// Story-specific triggers carry the `storyId` they belong to — medals are
// now a GLOBAL catalog, but a branch/scene/encounter/ending only exists in
// one story, so the trigger only fires while playing that story.
export const MedalTriggerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("branch"),
    storyId: z.string(),
    branchId: z.string(),
  }),
  z.object({
    type: z.literal("scene"),
    storyId: z.string(),
    sceneId: z.string(),
  }),
  z.object({
    type: z.literal("ending"),
    storyId: z.string(),
    endingId: z.string(),
  }),
  z.object({
    type: z.literal("encounter"),
    storyId: z.string(),
    encounterId: z.string(),
  }),
  /** Awarded after N companion dialogues. Story-agnostic (no storyId) —
   *  fires in any story. Replaces the old `free_input_count` trigger. */
  z.object({ type: z.literal("dialogue_count"), min: z.number().int().min(1) }),
]);

export const MedalSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  trigger: MedalTriggerSchema,
});

export const MedalsFileSchema = z.object({
  medals: z.array(MedalSchema),
});

export type MedalT = z.infer<typeof MedalSchema>;
export type MedalsFileT = z.infer<typeof MedalsFileSchema>;
