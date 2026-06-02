/**
 * Battle engine — turn-based combat for v2.0c (simplified).
 *
 * State machine:
 *   hero-choose → hero-puzzle → companion-rolling → monster-rolling → next round
 *   Terminal: victory | defeat
 *
 * Health model (simplified for kids):
 *   - Monsters have `hits` (1..5). Each successful attack removes one hit;
 *     a critical attack removes two.
 *   - Each attacker has cumulative HP (carries between battles).
 *
 * Pure — UI drives timing.
 */

import type {
  AttackerId,
  CompanionId,
  CompanionMoods,
  PartyHp,
} from "@/types/story";
import { MONSTERS, type MonsterStats } from "@/data/monsters";
import { getItem } from "@/data/items";
import type { ItemDefT } from "@/data/schemas";
import { rollD20, type RollResult } from "./dice";
import type { StagePosition } from "@/components/scene/ComposedScene";

export type BattlePhase =
  | "hero-choose"
  | "hero-puzzle"
  | "companion-rolling"
  | "monster-rolling"
  | "hero-defending"
  | "victory"
  | "defeat";

export type { AttackerId };

export interface BattleMonsterInstance {
  monsterId: string;
  name: string;
  hitsRemaining: number;
  maxHits: number;
  position: StagePosition;
  defeated: boolean;
}

export interface BattleLogEntry {
  text: string;
  roll?: RollResult;
  tone?:
    | "neutral"
    | "hit"
    | "miss"
    | "crit"
    | "fumble"
    | "victory"
    | "defeat";
}

export interface BattleState {
  phase: BattlePhase;
  round: number;
  /**
   * Active attacker's current HP. Mirrors `partyLives[activeAttacker]`
   * so the existing UI (HeartsBar) and damage-diff effects don't have
   * to reach into the per-character map.
   */
  heroLives: number;
  maxLives: number;
  /** Per-character HP. Source of truth — `heroLives` mirrors this for the
   *  active attacker. */
  partyLives: Record<AttackerId, number>;
  partyMaxLives: Record<AttackerId, number>;
  /** Attackers whose HP hit 0. Cannot be picked or auto-act. Persists into
   *  the post-battle PlayState. */
  fallenAttackers: AttackerId[];
  companions: CompanionId[];
  companionMoods: CompanionMoods;
  monsters: BattleMonsterInstance[];
  bg: string;
  log: BattleLogEntry[];
  pendingTargetIdx?: number;
  /** Monster index currently lunging at the hero (during hero-defending). */
  defendingMonsterIdx?: number;
  /** Who is the active attacker for the current/next puzzle. */
  activeAttacker: AttackerId;
  /** Consecutive correct puzzle answers across the party. */
  streak: number;
  monsterIdxThisRound: number;
  companionIdxThisRound: number;
  rewards: string[];
  /** Item ids spent during this battle. Removed from PlayState.inventory
   *  (one occurrence each) when the encounter resolves. */
  itemsConsumed: string[];
  /** Answer-timer freeze from a "stop-time" item. undefined = none.
   *  "whole-battle" = timer off for every remaining attack + defend.
   *  number = that many upcoming ATTACK puzzles have the timer off (decrements
   *  as each attack resolves; a one-attack item sets 1). Crit is suppressed
   *  while an attack is frozen. */
  timeFreeze?: "whole-battle" | number;
}

export type HeroAction =
  | { kind: "attack"; targetIdx: number }
  | { kind: "switch"; to: AttackerId }
  | { kind: "useItem"; itemId: string };

export interface PuzzleOutcome {
  correct: boolean;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────

export interface SetupArgs {
  bg: string;
  monsterIds: string[];
  /** Cumulative HP carried over from PlayState. Missing key → use max. */
  partyHp: PartyHp;
  partyMaxHp: PartyHp;
  /** Attackers already KO'd in earlier battles — they sit this one out. */
  fallenAttackers: AttackerId[];
  companions: CompanionId[];
  companionMoods: CompanionMoods;
}

const MONSTER_SLOTS: StagePosition[][] = [
  [],
  ["far-right"],
  ["right", "far-right"],
  ["right-center", "right", "far-right"],
  ["center", "right-center", "right", "far-right"],
];

export function setupBattle(args: SetupArgs): BattleState {
  const layout =
    MONSTER_SLOTS[Math.min(args.monsterIds.length, MONSTER_SLOTS.length - 1)];

  const monsters: BattleMonsterInstance[] = args.monsterIds
    .map((id, i) => {
      const stats: MonsterStats | undefined = MONSTERS[id];
      if (!stats) return null;
      return {
        monsterId: id,
        name: stats.name,
        hitsRemaining: stats.hits,
        maxHits: stats.hits,
        position: layout[i] ?? "right",
        defeated: stats.hits <= 0,
      };
    })
    .filter((m): m is BattleMonsterInstance => m !== null);

  // Build partyLives / partyMaxLives from the persistent PartyHp maps.
  // Fall back to maxHp where current HP is missing (e.g. companion just
  // joined and not yet stored).
  const allIds: AttackerId[] = ["hero", "scarecrow", "tinman", "lion"];
  const partyLives: Record<AttackerId, number> = {} as Record<
    AttackerId,
    number
  >;
  const partyMaxLives: Record<AttackerId, number> = {} as Record<
    AttackerId,
    number
  >;
  for (const id of allIds) {
    const max = args.partyMaxHp[id] ?? 3;
    partyMaxLives[id] = max;
    partyLives[id] = args.partyHp[id] ?? max;
  }

  // Pick the first non-fallen attacker (hero first, then companions).
  const partyOrder: AttackerId[] = ["hero", ...args.companions];
  const firstActive =
    partyOrder.find((a) => !args.fallenAttackers.includes(a)) ?? "hero";

  return {
    phase: "hero-choose",
    round: 1,
    heroLives: partyLives[firstActive],
    maxLives: partyMaxLives[firstActive],
    partyLives,
    partyMaxLives,
    fallenAttackers: [...args.fallenAttackers],
    companions: args.companions,
    companionMoods: args.companionMoods,
    monsters,
    bg: args.bg,
    log: [],
    activeAttacker: firstActive,
    streak: 0,
    monsterIdxThisRound: 0,
    companionIdxThisRound: 0,
    rewards: [],
    itemsConsumed: [],
  };
}

// ─────────────────────────────────────────────────────────────────
// Phase transitions
// ─────────────────────────────────────────────────────────────────

export function chooseHeroAction(
  state: BattleState,
  action: HeroAction,
): BattleState {
  if (action.kind === "switch") {
    if (state.fallenAttackers.includes(action.to)) return state;
    return {
      ...state,
      activeAttacker: action.to,
      heroLives: state.partyLives[action.to] ?? state.heroLives,
      maxLives: state.partyMaxLives[action.to] ?? state.maxLives,
    };
  }
  if (action.kind === "useItem") {
    // Stays in hero-choose — using an item is a free action, the player
    // still gets to attack/switch afterwards.
    return applyItemEffect(state, action.itemId);
  }
  // Attack
  return {
    ...state,
    pendingTargetIdx: action.targetIdx,
    phase: "hero-puzzle",
  };
}

/**
 * Whether `item` can currently be used in battle. Per-effect rules live
 * here (not in the UI) so the button enable/disable stays consistent.
 */
export function canUseItem(state: BattleState, item: ItemDefT): boolean {
  switch (item.effect.kind) {
    case "heal":
      // No point healing the active attacker at full HP.
      return (
        state.partyLives[state.activeAttacker] <
        state.partyMaxLives[state.activeAttacker]
      );
    case "stop-time":
      // No stacking — pointless to re-freeze while a freeze is already active.
      return state.timeFreeze === undefined;
    default:
      return false;
  }
}

/**
 * Whether the answer timer is currently frozen for a puzzle of `mode`. A
 * one-attack freeze (numeric counter) covers ATTACK puzzles only; a
 * whole-battle freeze covers both attack and defend. Shared by the BattleScreen
 * timer gate and the crit-suppression in resolvePuzzleAttack.
 */
export function timerFrozen(
  state: BattleState,
  mode: "attack" | "defend",
): boolean {
  if (state.timeFreeze === "whole-battle") return true;
  return mode === "attack" && typeof state.timeFreeze === "number" && state.timeFreeze > 0;
}

/**
 * Apply a consumable's effect to the battle state (pure). The `switch` is
 * the single battle extension point — add a `case` per new battle effect.
 * No-ops on unknown id, non-battle effect, or when `canUseItem` is false.
 */
export function applyItemEffect(
  state: BattleState,
  itemId: string,
): BattleState {
  const item = getItem(itemId);
  if (!item || !canUseItem(state, item)) return state;
  const effect = item.effect;
  switch (effect.kind) {
    case "heal": {
      const a = state.activeAttacker;
      const max = state.partyMaxLives[a];
      const healed = Math.min(max, state.partyLives[a] + effect.amount);
      return {
        ...state,
        partyLives: { ...state.partyLives, [a]: healed },
        heroLives: healed,
        itemsConsumed: [...state.itemsConsumed, itemId],
        log: [
          ...state.log,
          { text: `Used ${item.name} — healed to ${healed}/${max}.`, tone: "neutral" },
        ],
      };
    }
    case "stop-time": {
      return {
        ...state,
        timeFreeze: effect.scope === "whole-battle" ? "whole-battle" : 1,
        itemsConsumed: [...state.itemsConsumed, itemId],
        log: [
          ...state.log,
          {
            text: `Used ${item.name} — time stops! No time limit${
              effect.scope === "whole-battle"
                ? " this battle"
                : " on your next attack"
            }.`,
            tone: "neutral",
          },
        ],
      };
    }
    default:
      // [+EXT] handle new battle effect kinds here.
      return state;
  }
}

/**
 * Resolve the math puzzle.
 *  - correct + ≤3s   → critical (2 hits)
 *  - correct         → normal (1 hit)
 *  - streak ≥ 3      → +1 extra hit on next correct
 *  - wrong / timeout → miss (0 hits)
 */
export function resolvePuzzleAttack(
  state: BattleState,
  outcome: PuzzleOutcome,
): BattleState {
  const targetIdx = state.pendingTargetIdx;
  const log = [...state.log];

  if (targetIdx === undefined) {
    return { ...state, phase: "companion-rolling", companionIdxThisRound: 0 };
  }

  const target = state.monsters[targetIdx];
  if (!target || target.defeated) {
    return {
      ...state,
      phase: "companion-rolling",
      companionIdxThisRound: 0,
      pendingTargetIdx: undefined,
    };
  }

  let monsters = state.monsters;
  let streak = state.streak;
  const attackerLabel = attackerName(state.activeAttacker);
  // A one-attack freeze is spent by this attack (win or lose); whole-battle
  // persists. Crit is suppressed while frozen (no time pressure → no bonus).
  const wasFrozen = timerFrozen(state, "attack");
  const nextFreeze =
    wasFrozen && typeof state.timeFreeze === "number"
      ? state.timeFreeze - 1 || undefined
      : state.timeFreeze;

  if (outcome.correct) {
    streak += 1;
    const isCrit = !wasFrozen && outcome.durationMs <= 3000;
    let hitsDone = 1 + (isCrit ? 1 : 0) + (streak >= 3 ? 1 : 0);
    hitsDone = Math.max(1, Math.min(hitsDone, target.hitsRemaining));

    monsters = monsters.map((m, i) =>
      i === targetIdx
        ? {
            ...m,
            hitsRemaining: Math.max(0, m.hitsRemaining - hitsDone),
            defeated: m.hitsRemaining - hitsDone <= 0,
          }
        : m,
    );

    let text: string;
    let tone: BattleLogEntry["tone"];
    if (isCrit && streak >= 3) {
      text = `🔥 ${attackerLabel} blazes through the answer! ${target.name} reels (−${hitsDone} hits).`;
      tone = "crit";
    } else if (isCrit) {
      text = `⚡ Lightning-fast! ${attackerLabel} strikes ${target.name} hard (−${hitsDone} hits).`;
      tone = "crit";
    } else if (streak >= 3) {
      text = `${attackerLabel} stays on a roll — ${target.name} takes ${hitsDone} hits.`;
      tone = "hit";
    } else {
      text = `${attackerLabel} hits ${target.name}! (−${hitsDone} hit)`;
      tone = "hit";
    }
    log.push({ text, tone });
  } else {
    streak = 0;
    log.push({
      text: `${attackerLabel} missed — the answer was wrong.`,
      tone: "miss",
    });
  }

  const allDead = monsters.every((m) => m.defeated);
  if (allDead) {
    const rewards = monsters.flatMap((m) => {
      const meta = MONSTERS[m.monsterId];
      return meta?.drops ?? [];
    });
    return {
      ...state,
      monsters,
      log: [...log, { text: "You stand victorious!", tone: "victory" }],
      rewards,
      phase: "victory",
      pendingTargetIdx: undefined,
      streak,
      timeFreeze: nextFreeze,
    };
  }

  return {
    ...state,
    monsters,
    log,
    phase: "companion-rolling",
    companionIdxThisRound: 0,
    pendingTargetIdx: undefined,
    streak,
    timeFreeze: nextFreeze,
  };
}

export function stepCompanionTurn(state: BattleState): BattleState {
  if (state.companionIdxThisRound >= state.companions.length) {
    return { ...state, phase: "monster-rolling", monsterIdxThisRound: 0 };
  }

  const compId = state.companions[state.companionIdxThisRound];
  const mood = state.companionMoods[compId] ?? 5;
  const log = [...state.log];
  let monsters = state.monsters;

  if (state.fallenAttackers.includes(compId)) {
    // skip — companion is down for the count
  } else if (compId === state.activeAttacker) {
    // skip — they did the puzzle hit
  } else if (mood < 4) {
    log.push({
      text: `${prettyComp(compId)} hangs back, looking unsure.`,
      tone: "neutral",
    });
  } else {
    const targetIdx = monsters.findIndex((m) => !m.defeated);
    if (targetIdx !== -1) {
      const target = monsters[targetIdx];
      const supportRoll = rollD20(mood >= 8 ? 4 : 1);
      if (supportRoll.total >= 14) {
        monsters = monsters.map((mi, i) =>
          i === targetIdx
            ? {
                ...mi,
                hitsRemaining: Math.max(0, mi.hitsRemaining - 1),
                defeated: mi.hitsRemaining - 1 <= 0,
              }
            : mi,
        );
        log.push({
          text: `${prettyComp(compId)} ${compFlavor(compId)} — ${target.name} takes another hit!`,
          tone: "hit",
        });
      } else {
        log.push({
          text: `${prettyComp(compId)} tries to help but ${target.name} dodges.`,
          tone: "miss",
        });
      }
    }
  }

  const next: BattleState = {
    ...state,
    monsters,
    log,
    companionIdxThisRound: state.companionIdxThisRound + 1,
  };

  const allDead = monsters.every((m) => m.defeated);
  if (allDead) {
    const rewards = monsters.flatMap((m) => {
      const meta = MONSTERS[m.monsterId];
      return meta?.drops ?? [];
    });
    return {
      ...next,
      rewards,
      phase: "victory",
      log: [...log, { text: "Victory!", tone: "victory" }],
    };
  }

  if (next.companionIdxThisRound >= state.companions.length) {
    return { ...next, phase: "monster-rolling", monsterIdxThisRound: 0 };
  }
  return next;
}

/**
 * Begin a single monster's attack. Surfaces the attacker via
 * `defendingMonsterIdx` so the UI can pop a defense puzzle.
 *
 * When the round is done (no alive monsters left to act), advances to the
 * next round's hero-choose phase.
 */
export function enterMonsterAttack(state: BattleState): BattleState {
  const alive = state.monsters
    .map((m, i) => ({ m, originalIdx: i }))
    .filter((x) => !x.m.defeated);

  if (state.monsterIdxThisRound >= alive.length) {
    return {
      ...state,
      phase: "hero-choose",
      round: state.round + 1,
      monsterIdxThisRound: 0,
      companionIdxThisRound: 0,
      defendingMonsterIdx: undefined,
    };
  }

  const attacker = alive[state.monsterIdxThisRound];
  return {
    ...state,
    phase: "hero-defending",
    defendingMonsterIdx: attacker.originalIdx,
  };
}

/**
 * Resolve the defense puzzle.
 *  - correct  → MISS (the hero dodged); no damage
 *  - wrong    → HIT (lose one heart)
 *
 * Then advances to the next monster, or back to hero-choose if all done.
 */
export function resolveDefense(
  state: BattleState,
  outcome: PuzzleOutcome,
): BattleState {
  const log = [...state.log];
  const idx = state.defendingMonsterIdx;
  const attacker = idx !== undefined ? state.monsters[idx] : undefined;

  if (!attacker) {
    return {
      ...state,
      phase: "hero-choose",
      round: state.round + 1,
      monsterIdxThisRound: 0,
      companionIdxThisRound: 0,
      defendingMonsterIdx: undefined,
    };
  }

  const frontId = state.activeAttacker;
  const startHp = state.partyLives[frontId] ?? state.heroLives;
  let livesAfter = startHp;

  if (outcome.correct) {
    log.push({
      text: `You answer in time — ${attacker.name}'s blow whiffs past ${attackerName(frontId)}.`,
      tone: "miss",
    });
  } else {
    livesAfter = Math.max(0, startHp - 1);
    log.push({
      text: `${attacker.name} lands a blow on ${attackerName(frontId)}!`,
      tone: "hit",
    });
  }

  const partyLives = { ...state.partyLives, [frontId]: livesAfter };

  if (livesAfter <= 0) {
    const fallenAttackers = state.fallenAttackers.includes(frontId)
      ? state.fallenAttackers
      : [...state.fallenAttackers, frontId];
    log.push({
      text: `${attackerName(frontId)} falls back, unable to continue.`,
      tone: "defeat",
    });

    // Find next available attacker. Hero down is no longer auto-defeat —
    // companions can keep fighting; the battle only ends when EVERY
    // party member has fallen.
    const partyOrder: AttackerId[] = ["hero", ...state.companions];
    const nextActive = partyOrder.find(
      (a) => !fallenAttackers.includes(a),
    );

    if (!nextActive) {
      log.push({
        text: "Glinda's blessing carries you all to safety…",
        tone: "defeat",
      });
      return {
        ...state,
        log,
        partyLives,
        fallenAttackers,
        heroLives: 0,
        monsterIdxThisRound: state.monsterIdxThisRound + 1,
        defendingMonsterIdx: undefined,
        phase: "defeat",
      };
    }

    log.push({
      text: `${attackerName(nextActive)} steps up to the front!`,
      tone: "neutral",
    });

    const newActiveHp = partyLives[nextActive] ?? state.partyMaxLives[nextActive] ?? 3;
    return {
      ...state,
      log,
      partyLives,
      fallenAttackers,
      activeAttacker: nextActive,
      heroLives: newActiveHp,
      maxLives:
        state.partyMaxLives[nextActive] ?? state.maxLives,
      monsterIdxThisRound: state.monsterIdxThisRound + 1,
      defendingMonsterIdx: undefined,
      phase: "monster-rolling",
    };
  }

  const next: BattleState = {
    ...state,
    heroLives: livesAfter,
    partyLives,
    log,
    monsterIdxThisRound: state.monsterIdxThisRound + 1,
    defendingMonsterIdx: undefined,
  };

  const alive = state.monsters.filter((m) => !m.defeated);
  if (next.monsterIdxThisRound >= alive.length) {
    return {
      ...next,
      phase: "hero-choose",
      round: state.round + 1,
      monsterIdxThisRound: 0,
      companionIdxThisRound: 0,
    };
  }
  return {
    ...next,
    phase: "monster-rolling",
  };
}

/**
 * @deprecated Replaced by the {@link enterMonsterAttack} +
 * {@link resolveDefense} pair. Kept for backwards compatibility.
 */
export function stepMonsterTurn(state: BattleState): BattleState {
  return enterMonsterAttack(state);
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function compFlavor(id: CompanionId): string {
  switch (id) {
    case "lion":
      return "pounces with a roar";
    case "scarecrow":
      return "flails with surprising strength";
    case "tinman":
      return "swings his axe carefully";
  }
}

function prettyComp(id: CompanionId): string {
  switch (id) {
    case "lion":
      return "The Lion";
    case "scarecrow":
      return "The Scarecrow";
    case "tinman":
      return "The Tin Man";
  }
}

export function attackerName(a: AttackerId): string {
  if (a === "hero") return "You";
  return prettyComp(a);
}

export function canAttackerAct(
  attacker: AttackerId,
  state: BattleState,
): boolean {
  if (state.fallenAttackers.includes(attacker)) return false;
  if (attacker === "hero") return true;
  if (!state.companions.includes(attacker)) return false;
  const mood = state.companionMoods[attacker] ?? 5;
  return mood >= 4;
}
