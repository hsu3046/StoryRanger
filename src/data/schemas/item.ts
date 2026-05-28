import { z } from "zod";

/**
 * Item catalog — the formal definition of every item that can appear in
 * inventory, monster drops, encounter rewards, or dialogue gifts. Replaces
 * the previous free-form string IDs scattered across the code.
 */

export const ItemCategorySchema = z.enum([
  "trophy", // memento, no gameplay use (wolf-fang, monkey-feather)
  "tool", // potentially usable (mouse-call, wisp-light)
  "consumable", // future use
  "keepsake", // emotional value (lost-pup-trust)
  "key-item", // story-critical (silver-shoes, witch-broom)
]);

export const ItemRaritySchema = z
  .enum(["common", "uncommon", "rare", "unique"])
  .default("common");

export const ItemDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Emoji or path under /public/items/. */
  icon: z.string().optional(),
  description: z.string(),
  category: ItemCategorySchema,
  rarity: ItemRaritySchema,
});

export const ItemsFileSchema = z.object({
  items: z.array(ItemDefSchema),
});

export type ItemDefT = z.infer<typeof ItemDefSchema>;
export type ItemsFileT = z.infer<typeof ItemsFileSchema>;
