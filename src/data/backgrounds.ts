/**
 * Background catalog — loaded from JSON via Zod-validated content layer.
 * Keys match filenames in /public/stories/<storyId>/backgrounds/<key>.*
 * Used by composer + encounter engine.
 */

import backgroundsJson from "@/stories/wizard-of-oz/backgrounds.json";
import { BackgroundsFileSchema } from "./schemas";

export interface BackgroundMeta {
  key: string;
  label: string;
  bgm: string;
  mood: "calm" | "tense" | "magical" | "spooky" | "warm";
}

const parsed = BackgroundsFileSchema.parse(backgroundsJson);

export const BACKGROUNDS: Record<string, BackgroundMeta> = Object.fromEntries(
  parsed.backgrounds.map((b) => [b.key, b as BackgroundMeta]),
);

export function getBackground(key: string): BackgroundMeta | null {
  return BACKGROUNDS[key] ?? null;
}

export function listBackgrounds(): BackgroundMeta[] {
  return parsed.backgrounds as BackgroundMeta[];
}
