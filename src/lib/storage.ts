import type { PlayState } from "@/types/story";
import { DEFAULT_HERO } from "./narrative";

const KEY_PREFIX = "storyranger:play:";

export function saveState(state: PlayState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${KEY_PREFIX}${state.storyId}`,
      JSON.stringify(state),
    );
  } catch {
    // Quota exceeded or private mode — silent ignore (single-slot, small payload).
  }
}

export function loadState(storyId: string): PlayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${storyId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayState;
    // Backfill hero for saves created before the personalization feature.
    if (!parsed.hero) {
      parsed.hero = { ...DEFAULT_HERO };
    }
    if (!parsed.partyHp) parsed.partyHp = { hero: 3 };
    if (!parsed.partyMaxHp) parsed.partyMaxHp = { hero: 3 };
    if (!parsed.fallenAttackers) parsed.fallenAttackers = [];
    if (!parsed.completedEncounters) parsed.completedEncounters = [];
    if (!parsed.companionMoods) parsed.companionMoods = {};
    if (!parsed.dialogueHistory) parsed.dialogueHistory = {};
    if (!parsed.inventory) parsed.inventory = [];
    return parsed;
  } catch {
    return null;
  }
}

export function clearState(storyId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${KEY_PREFIX}${storyId}`);
}
