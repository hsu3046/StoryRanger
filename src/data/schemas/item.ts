import { z } from "zod";

/**
 * Item catalog — every item is now a FUNCTIONAL consumable used during
 * gameplay (medals carry the collection/achievement role). Each item has a
 * structured `effect`; only `heal` ships today, but `ItemEffectSchema` is a
 * discriminated union so new effects are a one-line additive change. See
 * data/item-effects.ts for the metadata/usage-context registry.
 */

export const ItemEffectSchema = z.discriminatedUnion("kind", [
  /** Restore `amount` HP to the active attacker (battle only). */
  z.object({ kind: z.literal("heal"), amount: z.number().int().min(1).max(10) }),
  /** Story/event-use item (e.g. oil for the Tin Man). No mechanical effect —
   *  it lives in the inventory to be referenced by scene/branch logic, not
   *  "used" in battle. */
  z.object({ kind: z.literal("event") }),
  // [+EXT] add future kinds here, e.g.:
  // z.object({ kind: z.literal("hint") }),                            // quiz: dim 2 wrong answers
  // z.object({ kind: z.literal("extra-time"), seconds: z.number().int() }), // quiz: extend timer
  // z.object({ kind: z.literal("skip-monster") }),                    // battle: remove 1 monster
  // z.object({ kind: z.literal("shield") }),                          // battle: block next hit
]);

export const ItemDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Emoji or path under /public/items/. */
  icon: z.string().optional(),
  description: z.string(),
  effect: ItemEffectSchema,
});

export const ItemsFileSchema = z.object({
  items: z.array(ItemDefSchema),
});

export type ItemEffectT = z.infer<typeof ItemEffectSchema>;
export type ItemEffectKind = ItemEffectT["kind"];
export type ItemDefT = z.infer<typeof ItemDefSchema>;
export type ItemsFileT = z.infer<typeof ItemsFileSchema>;
