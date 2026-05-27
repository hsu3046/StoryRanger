/**
 * Item catalog — loaded from JSON via Zod-validated content layer.
 * Centralises all item definitions so monster.drops, encounter rewards,
 * and dialogue gifts all reference a known catalog rather than free
 * strings.
 */

import itemsJson from "@/stories/wizard-of-oz/items.json";
import { ItemsFileSchema, type ItemDefT } from "./schemas";

export type ItemDef = ItemDefT;

const parsed = ItemsFileSchema.parse(itemsJson);

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  parsed.items.map((it: ItemDefT) => [it.id, it]),
);

export function getItem(id: string): ItemDef | null {
  return ITEMS[id] ?? null;
}

export function listItems(): ItemDef[] {
  return parsed.items;
}

/**
 * Pretty-print an item id for display. Falls back to title-casing the
 * kebab-case id if the catalog doesn't know it (so legacy / LLM-generated
 * unknown ids still render gracefully).
 */
export function prettyItem(id: string): string {
  const known = ITEMS[id];
  if (known) return known.name;
  return id
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function itemIcon(id: string): string {
  return ITEMS[id]?.icon ?? "🎁";
}
