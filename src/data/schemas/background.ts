import { z } from "zod";

export const BackgroundMoodSchema = z.enum([
  "calm",
  "tense",
  "magical",
  "spooky",
  "warm",
]);

export const BackgroundMetaSchema = z.object({
  key: z.string(),
  label: z.string(),
  bgm: z.string(),
  mood: BackgroundMoodSchema,
});

export const BackgroundsFileSchema = z.object({
  backgrounds: z.array(BackgroundMetaSchema),
});

export type BackgroundMetaT = z.infer<typeof BackgroundMetaSchema>;
export type BackgroundsFileT = z.infer<typeof BackgroundsFileSchema>;
