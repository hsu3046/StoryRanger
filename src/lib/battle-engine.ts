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
import { monstersFor, normalizeDrop, type MonsterStats } from "@/data/monsters";
import { getItem } from "@/data/items";
import type { ItemDefT } from "@/data/schemas";
import type { RollResult } from "./dice";
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
    | "counter"
    | "fumble"
    | "victory"
    | "defeat";
}

export interface BattleState {
  /** The story this battle belongs to — drives the per-story monster/item
   *  catalog lookups (drops, item effects) from inside these pure functions. */
  storyId: string;
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
  /** Who is the active attacker for the current/next puzzle. Cycles through
   *  `actingOrder` during the ally attack phase; restored to `leadAttacker`
   *  before the enemy phase. */
  activeAttacker: AttackerId;
  /** The designated frontline/tank — who the enemy targets during the enemy
   *  phase. Player-chosen via tap-to-switch at hero-choose; defaults to the
   *  first living member, and follows "steps up" when the front falls. */
  leadAttacker: AttackerId;
  /** This round's ally attack order — a shuffled list of living members, each
   *  taking one attack puzzle. Rebuilt when the round's Attack begins. */
  actingOrder: AttackerId[];
  /** Cursor into `actingOrder` for the ally currently attacking. */
  allyIdx: number;
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
  /** Pending "attack-boost" from an item: the next SUCCESSFUL attack deals this
   *  many extra hits (added on top of crit/streak). A miss leaves it intact;
   *  a landed hit consumes it. undefined = none. */
  attackBoost?: number;
}

export type HeroAction =
  | { kind: "attack" }
  | { kind: "switch"; to: AttackerId }
  | { kind: "useItem"; itemId: string; targetId?: AttackerId };

export interface PuzzleOutcome {
  correct: boolean;
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────

export interface SetupArgs {
  /** Story the battle belongs to — selects the per-story monster catalog. */
  storyId: string;
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

// ─────────────────────────────────────────────────────────────────
// Turn helpers
// ─────────────────────────────────────────────────────────────────

/** Index of the frontmost still-standing monster (auto-target), or undefined. */
function firstAliveMonsterIdx(
  monsters: BattleMonsterInstance[],
): number | undefined {
  const i = monsters.findIndex((m) => !m.defeated);
  return i === -1 ? undefined : i;
}

/** Living party members in fixed roster order (hero first). */
function livingParty(state: BattleState): AttackerId[] {
  const order: AttackerId[] = ["hero", ...state.companions];
  return order.filter((a) => !state.fallenAttackers.includes(a));
}

/** The lead/tank if still standing, else the first living member. */
function livingLead(state: BattleState): AttackerId {
  if (!state.fallenAttackers.includes(state.leadAttacker)) {
    return state.leadAttacker;
  }
  return livingParty(state)[0] ?? state.activeAttacker;
}

/** Fisher–Yates shuffle (non-mutating) — randomises the ally attack order each
 *  round so the turn flow doesn't feel scripted. */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Switch the active attacker to `to`, keeping the mirrored HP fields in sync. */
function withActive(state: BattleState, to: AttackerId): BattleState {
  return {
    ...state,
    activeAttacker: to,
    heroLives: state.partyLives[to] ?? state.heroLives,
    maxLives: state.partyMaxLives[to] ?? state.maxLives,
  };
}

/** After an ally's attack resolves, advance to the next living ally's puzzle;
 *  once every ally has acted, restore the lead to the front (the enemy's
 *  target) and hand the round to the monsters. Assumes at least one monster is
 *  still alive (the victory check runs before this). */
function advanceAlly(state: BattleState): BattleState {
  const order = state.actingOrder ?? [];
  let ni = state.allyIdx + 1;
  while (ni < order.length && state.fallenAttackers.includes(order[ni])) ni++;
  const targetIdx = firstAliveMonsterIdx(state.monsters);

  if (ni < order.length && targetIdx !== undefined) {
    return {
      ...withActive(state, order[ni]),
      allyIdx: ni,
      pendingTargetIdx: targetIdx,
      phase: "hero-puzzle",
    };
  }

  // Ally phase done → the lead steps to the front to face the monsters.
  return {
    ...withActive(state, livingLead(state)),
    pendingTargetIdx: undefined,
    monsterIdxThisRound: 0,
    phase: "monster-rolling",
  };
}

export function setupBattle(args: SetupArgs): BattleState {
  const catalog = monstersFor(args.storyId);
  const layout =
    MONSTER_SLOTS[Math.min(args.monsterIds.length, MONSTER_SLOTS.length - 1)];

  const monsters: BattleMonsterInstance[] = args.monsterIds
    .map((id, i) => {
      const stats: MonsterStats | undefined = catalog[id];
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

  // Guard against a zero-monster battle (e.g. an encounter referencing a
  // monster id absent from THIS story's catalog — every id was dropped above).
  // Without this the player would be trapped on an unwinnable hero-choose with
  // no attack targets and no exit. Start in a terminal victory so the
  // TerminalPanel's Continue button fires onComplete and exits cleanly.
  if (monsters.length === 0 && args.monsterIds.length > 0) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[battle] all monsterIds dropped for story "${args.storyId}" — not in its monster catalog:`,
        args.monsterIds,
      );
    }
  }

  return {
    storyId: args.storyId,
    phase: monsters.length === 0 ? "victory" : "hero-choose",
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
    leadAttacker: firstActive,
    actingOrder: [],
    allyIdx: 0,
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
    // Tap-to-switch picks the LEAD (the tank the enemy targets) as well as the
    // shown frontline, so the choice persists into the enemy phase.
    return { ...withActive(state, action.to), leadAttacker: action.to };
  }
  if (action.kind === "useItem") {
    // A free action, but ONLY at the hero-choose decision point — never let an
    // armed heal fire mid-puzzle or mid-defense.
    if (state.phase !== "hero-choose") return state;
    return applyItemEffect(state, action.itemId, action.targetId);
  }
  // Attack → begin the ally round: every WILLING member (alive + not sulking)
  // takes one attack puzzle in a freshly shuffled order, each auto-targeting the
  // frontmost monster. canAttackerAct gates on the mood (<4 = hangs back), the
  // same gate as tap-to-switch — so a sulking companion sits the round out
  // consistently. Fall back to the full living party if nobody is willing
  // (e.g. hero down + all companions sulking) so the round can never stall.
  const targetIdx = firstAliveMonsterIdx(state.monsters);
  if (targetIdx === undefined) return state;
  const willing = livingParty(state).filter((a) => canAttackerAct(a, state));
  const order = shuffle(willing.length ? willing : livingParty(state));
  const first = order[0] ?? state.activeAttacker;
  return {
    ...withActive(state, first),
    actingOrder: order,
    allyIdx: 0,
    pendingTargetIdx: targetIdx,
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
      // Usable if ANY living member is below full HP (the player picks which
      // one to heal). No point if the whole standing party is topped up.
      return livingParty(state).some(
        (a) => state.partyLives[a] < state.partyMaxLives[a],
      );
    case "stop-time":
      // No stacking — pointless to re-freeze while a freeze is already active.
      return state.timeFreeze === undefined;
    case "attack-boost":
      // No stacking — one pending boost at a time.
      return state.attackBoost === undefined;
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
  targetId?: AttackerId,
): BattleState {
  const item = getItem(state.storyId, itemId);
  if (!item || !canUseItem(state, item)) return state;
  const effect = item.effect;
  switch (effect.kind) {
    case "heal": {
      // Heal the chosen target (a living member); fall back to the active
      // attacker if none/invalid was passed.
      const a =
        targetId && !state.fallenAttackers.includes(targetId)
          ? targetId
          : state.activeAttacker;
      const max = state.partyMaxLives[a];
      // Already full → no-op (don't waste the item).
      if (state.partyLives[a] >= max) return state;
      const healed = Math.min(max, state.partyLives[a] + effect.amount);
      return {
        ...state,
        partyLives: { ...state.partyLives, [a]: healed },
        // heroLives mirrors the ACTIVE attacker only — update it just when the
        // healed member is the one currently fronting.
        heroLives: a === state.activeAttacker ? healed : state.heroLives,
        itemsConsumed: [...state.itemsConsumed, itemId],
        log: [
          ...state.log,
          {
            text: `Used ${item.name} — ${attackerName(a)} healed to ${healed}/${max}.`,
            tone: "neutral",
          },
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
    case "attack-boost": {
      return {
        ...state,
        attackBoost: effect.amount,
        itemsConsumed: [...state.itemsConsumed, itemId],
        log: [
          ...state.log,
          {
            text: `Used ${item.name} — your next hit lands +${effect.amount}!`,
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
 *  - correct + ≤5s   → critical (2 hits)
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
    return advanceAlly(state);
  }

  const target = state.monsters[targetIdx];
  if (!target || target.defeated) {
    return advanceAlly({ ...state, pendingTargetIdx: undefined });
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
  // An attack-boost is consumed only by a LANDED hit (a miss keeps it pending).
  const nextBoost = outcome.correct ? undefined : state.attackBoost;

  if (outcome.correct) {
    streak += 1;
    const isCrit = !wasFrozen && outcome.durationMs <= 5000;
    // +X from an attack-boost item, on top of crit/streak (crit damage + X).
    let hitsDone =
      1 + (isCrit ? 1 : 0) + (streak >= 3 ? 1 : 0) + (state.attackBoost ?? 0);
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
    const catalog = monstersFor(state.storyId);
    // Roll each drop by its chance (plain-string drops normalize to 100%).
    // Computed once here at the victory transition and stored in state.rewards,
    // so a re-render never re-rolls; a "Try again" re-mount rolls fresh.
    const rewards = monsters.flatMap((m) => {
      const meta = catalog[m.monsterId];
      return (meta?.drops ?? [])
        .map(normalizeDrop)
        .filter((d) => Math.random() * 100 < d.chance)
        .map((d) => d.item);
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
      attackBoost: nextBoost,
    };
  }

  return advanceAlly({
    ...state,
    monsters,
    log,
    pendingTargetIdx: undefined,
    streak,
    timeFreeze: nextFreeze,
    attackBoost: nextBoost,
  });
}

export function stepCompanionTurn(state: BattleState): BattleState {
  // Companions now take full attack turns in the ally loop (resolvePuzzleAttack
  // → advanceAlly), so there is no separate auto-assist phase. New battles never
  // enter 'companion-rolling'; this remains only to resolve a pre-refactor save
  // persisted mid that phase — hand it straight to the monster phase.
  return { ...state, phase: "monster-rolling", monsterIdxThisRound: 0 };
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
  // Defense can now damage a monster (the Counter Attack), so monsters is
  // mutable here — previously a defense never touched the monster roster.
  let monsters = state.monsters;
  let counterKill = false;

  if (outcome.correct) {
    log.push({
      text: `You answer in time — ${attacker.name}'s blow whiffs past ${attackerName(frontId)}.`,
      tone: "miss",
    });
    // Counter Attack — a FAST defense (≤5s, timer not frozen) lets the
    // front-liner strike the attacker back for 1 hit. Mirrors the attack
    // crit's "no bonus while time is frozen" rule.
    const counters =
      !timerFrozen(state, "defend") && outcome.durationMs <= 5000;
    if (counters) {
      const hitsRemaining = Math.max(0, attacker.hitsRemaining - 1);
      counterKill = hitsRemaining <= 0;
      monsters = monsters.map((m, i) =>
        i === idx ? { ...m, hitsRemaining, defeated: counterKill } : m,
      );
      log.push({
        text: counterKill
          ? `⚡ Counter! ${attackerName(frontId)} strikes back and downs ${attacker.name}!`
          : `⚡ Counter! ${attackerName(frontId)} strikes back at ${attacker.name} (−1 hit).`,
        tone: "counter",
      });
    }
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
    const base: BattleState = {
      ...state,
      log,
      partyLives,
      fallenAttackers,
      activeAttacker: nextActive,
      // The new front also becomes the lead/tank the enemy keeps targeting.
      leadAttacker: nextActive,
      heroLives: newActiveHp,
      maxLives: state.partyMaxLives[nextActive] ?? state.maxLives,
      monsterIdxThisRound: state.monsterIdxThisRound + 1,
      defendingMonsterIdx: undefined,
      phase: "monster-rolling",
    };
    // If that was the round's last monster, go straight to the next round's
    // hero-choose (mirror the non-KO branch below) — otherwise the UI shows an
    // empty ~900ms monster beat with no attacker before the round flips.
    const aliveAfter = state.monsters.filter((m) => !m.defeated);
    if (base.monsterIdxThisRound >= aliveAfter.length) {
      return {
        ...base,
        phase: "hero-choose",
        round: state.round + 1,
        monsterIdxThisRound: 0,
        companionIdxThisRound: 0,
      };
    }
    return base;
  }

  // A Counter that downs the LAST standing monster ends the battle right here.
  if (monsters.every((m) => m.defeated)) {
    const catalog = monstersFor(state.storyId);
    const rewards = monsters.flatMap((m) => {
      const meta = catalog[m.monsterId];
      return (meta?.drops ?? [])
        .map(normalizeDrop)
        .filter((d) => Math.random() * 100 < d.chance)
        .map((d) => d.item);
    });
    return {
      ...state,
      monsters,
      heroLives: livesAfter,
      partyLives,
      log: [...log, { text: "You stand victorious!", tone: "victory" }],
      rewards,
      defendingMonsterIdx: undefined,
      phase: "victory",
    };
  }

  // When a Counter kills the attacker, that monster drops out of the alive
  // list, shifting every later monster down one slot — so KEEP the index (no
  // +1) to land on the next monster instead of skipping it. Otherwise advance.
  const next: BattleState = {
    ...state,
    monsters,
    heroLives: livesAfter,
    partyLives,
    log,
    monsterIdxThisRound: state.monsterIdxThisRound + (counterKill ? 0 : 1),
    defendingMonsterIdx: undefined,
  };

  const alive = monsters.filter((m) => !m.defeated);
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
