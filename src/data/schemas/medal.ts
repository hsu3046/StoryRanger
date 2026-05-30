import { z } from "zod";

/**
 * Play metric a medal is earned from — a cumulative counter derived from
 * PlayState (see `computeMetrics`). Medals are a story-agnostic catalog,
 * earned automatically once the metric reaches the medal's `threshold`.
 */
export const MedalMetricSchema = z.enum([
  "friends",
  "dialogues",
  "battles",
  "choices",
  "gifts",
]);

export const MedalSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  description: z.string(),
  metric: MedalMetricSchema,
  threshold: z.number().int().min(1),
});

export const MedalsFileSchema = z.object({
  medals: z.array(MedalSchema),
});

export type MedalT = z.infer<typeof MedalSchema>;
export type MedalsFileT = z.infer<typeof MedalsFileSchema>;
