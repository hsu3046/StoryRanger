import { z } from "zod";

/**
 * Medal trigger — when this medal is awarded.
 */
export const MedalTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("branch"), branchId: z.string() }),
  z.object({ type: z.literal("scene"), sceneId: z.string() }),
  z.object({ type: z.literal("ending"), endingId: z.string() }),
  z.object({ type: z.literal("encounter"), encounterId: z.string() }),
  /** Awarded after N companion dialogues — replaces the old
   *  `free_input_count` trigger now that free input is gone. */
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
