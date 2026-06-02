/**
 * Item catalog — read per-story from the loaded story module.
 *
 * Centralises item definitions so monster.drops, encounter rewards, and
 * dialogue gifts all reference a known per-story catalog rather than free
 * strings. Previously a single hardcoded wizard-of-oz global (`ITEMS`); now
 * keyed by storyId via `getStory`. Call sites pass the storyId in scope.
 */

import { getStory } from "@/lib/stories";
import type { ItemDefT } from "./schemas";

export type ItemDef = ItemDefT;

/** Lookup map (id → def) for a story. */
export function itemsMapFor(storyId: string): Record<string, ItemDef> {
  const list = getStory(storyId)?.items.items ?? [];
  return Object.fromEntries(list.map((it) => [it.id, it]));
}

export function getItem(storyId: string, id: string): ItemDef | null {
  return itemsMapFor(storyId)[id] ?? null;
}

export function listItems(storyId: string): ItemDef[] {
  return getStory(storyId)?.items.items ?? [];
}

/**
 * Pretty-print an item id for display. Falls back to title-casing the
 * kebab-case id if the catalog doesn't know it (so legacy / LLM-generated
 * unknown ids still render gracefully).
 */
export function prettyItem(storyId: string, id: string): string {
  const known = itemsMapFor(storyId)[id];
  if (known) return known.name;
  return id
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export function itemIcon(storyId: string, id: string): string {
  return itemsMapFor(storyId)[id]?.icon ?? "🎁";
}
