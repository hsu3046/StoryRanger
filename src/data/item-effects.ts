/**
 * Single source of truth for item-effect metadata + where each effect may
 * be used. UIs and gating read this registry instead of hardcoding effect
 * kinds, so adding a new effect is a localized, additive change:
 *   1. add a member to `ItemEffectSchema` (data/schemas/item.ts)
 *   2. add an entry here
 *   3. handle it where that context resolves (battle-engine / puzzle UI)
 */
import type { ItemDefT, ItemEffectKind, ItemEffectT } from "./schemas";

/** Where a consumable can be used. */
export type UsageContext = "battle" | "puzzle";

interface EffectMeta {
  /** Short label for the admin table + the in-game bag (e.g. "Heal +2"). */
  label: (effect: ItemEffectT) => string;
  /** Contexts this effect is offered in. */
  contexts: UsageContext[];
}

export const EFFECT_META: Record<ItemEffectKind, EffectMeta> = {
  heal: {
    label: (e) => (e.kind === "heal" ? `Heal +${e.amount}` : "Heal"),
    contexts: ["battle"],
  },
  event: {
    // Story/event item — no mechanical effect, so it's never offered as a
    // usable consumable (empty contexts).
    label: () => "Event",
    contexts: [],
  },
  // [+EXT] hint: { label: () => "Hint", contexts: ["puzzle"] },
  // [+EXT] "extra-time": { label: (e) => `+${e.seconds}s`, contexts: ["puzzle"] },
  // [+EXT] "skip-monster": { label: () => "Skip monster", contexts: ["battle"] },
  // [+EXT] shield: { label: () => "Shield", contexts: ["battle"] },
};

/** Human label for an item's effect (used by admin table + bag). */
export function effectLabel(effect: ItemEffectT): string {
  return EFFECT_META[effect.kind].label(effect);
}

/** Whether an item's effect may be used in the given context. */
export function itemUsableIn(item: ItemDefT, ctx: UsageContext): boolean {
  return EFFECT_META[item.effect.kind].contexts.includes(ctx);
}
