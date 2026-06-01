"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Backpack, GearSix, Sword, X as XIcon } from "@phosphor-icons/react";

import {
  attackerName,
  canAttackerAct,
  canUseItem,
  chooseHeroAction,
  enterMonsterAttack,
  resolveDefense,
  resolvePuzzleAttack,
  setupBattle,
  stepCompanionTurn,
  timerFrozen,
  type AttackerId,
  type BattleState,
  type HeroAction,
  type SetupArgs,
} from "@/lib/battle-engine";
import { getAudio, SFX } from "@/lib/audio-engine";
import { encounterOutroLine } from "@/lib/encounter-lines";
import { assetUrl } from "@/lib/asset-paths";
import { MONSTERS } from "@/data/monsters";
import { getItem, itemIcon, prettyItem } from "@/data/items";
import { effectLabel, itemUsableIn } from "@/data/item-effects";
import { characterSize, sizeScale } from "@/lib/sprite-size";
import { generateChallenge, type Challenge } from "@/lib/education";

import { ComposedScene, type StagePosition } from "../scene/ComposedScene";
import { HitsBar } from "./HpBar";
import { EducationalChallenge } from "../challenge/EducationalChallenge";
import { DamageNumber, type FloatingEffect } from "./DamageNumber";

import type {
  Character,
  CompanionId,
  PartyHp,
  SpeakerId,
} from "@/types/story";

interface Props {
  setup: SetupArgs;
  storyId: string;
  characterImageBase: (id: SpeakerId | CompanionId) => string;
  /** The story's protagonist id — the battle "hero" attacker maps to this
   *  speaker for its sprite / name (was hardcoded "dorothy"). */
  heroId: SpeakerId;
  /** Character roster — used for per-character sprite sizing (Toto small,
   *  Lion large, etc.). Passed in rather than imported from a specific
   *  story file so the battle component stays story-agnostic. */
  characters: readonly Character[];
  /** Optional saved BattleState — when present, mounts mid-fight instead
   *  of running `setupBattle(setup)`. Used by the refresh-resume flow. */
  initialState?: BattleState;
  /** Fires on every engine state mutation so the parent can persist the
   *  live BattleState alongside PlayState. */
  onStateChange?: (state: BattleState) => void;
  onComplete: (result: {
    outcome: "victory" | "defeat" | "escaped";
    rewards: string[];
    /** Final HP per attacker — carries into the persistent PlayState. */
    partyHp: PartyHp;
    /** Attackers KO'd this battle, appended to PlayState.fallenAttackers. */
    fallenAttackers: AttackerId[];
    /** Items spent during the battle — removed from PlayState.inventory. */
    itemsConsumed: string[];
  }) => void;
  /** "Try again" on the defeat panel — restart this battle fresh. When absent,
   *  the defeat panel falls back to a single "Leave the story" button. */
  onRetry?: () => void;
  /** Open the global Settings modal from inside the battle. */
  onOpenSettings?: () => void;
  /** Player inventory (item ids, may repeat). Drives the in-battle item
   *  row; consumed items are removed from PlayState when the battle ends. */
  inventory?: string[];
  /** Encounter-level drop items (in addition to monster drops) — folded into
   *  the victory panel's loot. */
  victoryItems?: string[];
  /** Player's age (from onboarding) — drives challenge difficulty tier. */
  age: number;
  /** When set, called with a missed challenge so the home "Check Your Answers"
   *  review can collect it. Undefined in admin preview / demo (no recording). */
  recordWrongChallenge?: (challenge: Challenge) => void;
}

const HERO_POSITIONS: Record<number, StagePosition[]> = {
  1: ["far-left"],
  2: ["far-left", "left"],
  3: ["far-left", "left", "left-center"],
  4: ["far-left", "left", "left-center", "center"],
};

export function BattleScreen({
  setup,
  storyId,
  characterImageBase,
  heroId,
  characters,
  initialState,
  onStateChange,
  onComplete,
  onRetry,
  onOpenSettings,
  inventory = [],
  victoryItems,
  age,
  recordWrongChallenge,
}: Props) {
  const [state, setState] = useState<BattleState>(
    () => initialState ?? setupBattle(setup),
  );
  const [effects, setEffects] = useState<FloatingEffect[]>([]);
  const prevHitsRef = useRef<number[]>([]);
  // Anchor the lives baseline to the actual mounted state, not to setup —
  // when resuming mid-battle from a saved initialState the hero may already
  // be wounded, and using setup HP would spawn a spurious hurt FX on mount.
  const prevLivesRef = useRef<number>(state.heroLives);
  const effectIdRef = useRef(0);

  // Bubble every BattleState change up to the parent so the live state is
  // persisted alongside PlayState. Refresh-resume reads this back as the
  // `initialState` prop on the next mount.
  useEffect(() => {
    onStateChange?.(state);
    // We intentionally do NOT depend on `onStateChange` itself — parents
    // typically pass an inline arrow, which would re-fire this effect on
    // every render and waste work. Only the engine state matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Attack/hurt motion FX — short-lived flags consumed by SpriteLayer.
  const [attackingAttacker, setAttackingAttacker] = useState<AttackerId | null>(
    null,
  );
  const [attackingMonsterIdx, setAttackingMonsterIdx] = useState<number | null>(
    null,
  );
  const [hurtingHero, setHurtingHero] = useState(false);
  const [dodgingHero, setDodgingHero] = useState(false);
  const [hurtingMonsterIdx, setHurtingMonsterIdx] = useState<number | null>(
    null,
  );

  // Lunge animation only — recoil is wired in the hits/lives diff effect.
  function triggerAttackerLunge(attacker: AttackerId) {
    setAttackingAttacker(attacker);
    setTimeout(() => setAttackingAttacker(null), 380);
  }

  /** Tracks who was the active attacker on the previous render so we can
   *  distinguish a real combat update from a free `switch` action. */
  const prevActiveRef = useRef<AttackerId>(state.activeAttacker);

  // Diff the engine state vs the previous render to spawn floating
  // numbers above the target whose HP/hits changed.
  useEffect(() => {
    // A character-switch shouldn't trigger damage / DODGE / hurt FX —
    // the heroLives change is purely because we swapped to a different
    // attacker's HP, not because someone took damage. Reset refs to the
    // new active's baseline and bail out.
    if (prevActiveRef.current !== state.activeAttacker) {
      prevActiveRef.current = state.activeAttacker;
      prevLivesRef.current = state.heroLives;
      prevHitsRef.current = state.monsters.map((m) => m.hitsRemaining);
      return;
    }

    const newEffects: FloatingEffect[] = [];
    const prev = prevHitsRef.current;
    const lastTone = state.log[state.log.length - 1]?.tone;

    // The active attacker sits in the right-most party slot (frontline).
    // Damage / DODGE / MISS markers anchor on their actual stage position
    // so the kid sees the effect over whoever is actually fighting.
    const partySize = 1 + state.companions.length;
    const activePos =
      (HERO_POSITIONS[partySize]?.[partySize - 1] as StagePosition) ??
      "far-left";

    state.monsters.forEach((m, i) => {
      const before = prev[i];
      if (before === undefined) return;
      const delta = before - m.hitsRemaining;
      if (delta > 0) {
        effectIdRef.current += 1;
        newEffects.push({
          id: effectIdRef.current,
          anchor: m.position,
          airborne: !!MONSTERS[m.monsterId]?.airborne,
          amount: delta,
          kind: lastTone === "crit" ? "crit" : "hit",
        });
      }
    });

    // Hero damage
    const livesBefore = prevLivesRef.current;
    if (state.heroLives < livesBefore) {
      effectIdRef.current += 1;
      newEffects.push({
        id: effectIdRef.current,
        anchor: activePos,
        amount: livesBefore - state.heroLives,
        kind: "hit",
      });
      // Recoil the hero — same gentle bounce as the monster recoil.
      setHurtingHero(true);
      setTimeout(() => setHurtingHero(false), 380);
    }

    // Recoil the monster that just took a hit (covers companion side-hits
    // not covered by the puzzle callback).
    state.monsters.forEach((m, i) => {
      const before = prev[i];
      if (before === undefined) return;
      if (m.hitsRemaining < before) {
        setHurtingMonsterIdx(i);
        setTimeout(() => setHurtingMonsterIdx(null), 380);
      }
    });

    // Miss markers — over the active attacker when a monster missed / hero
    // defended; over the targeted monster when hero attack went wrong.
    if (lastTone === "miss") {
      const lastText = state.log[state.log.length - 1]?.text ?? "";
      const looksLikeHeroDefend = /whiffs past|answer in time/.test(lastText);
      const looksLikeMonsterMiss = /lunges but misses/.test(lastText);
      const looksLikeHeroMiss = /missed|wrong answer|misses [A-Z]/.test(
        lastText,
      );
      if (looksLikeHeroDefend) {
        effectIdRef.current += 1;
        newEffects.push({
          id: effectIdRef.current,
          anchor: activePos,
          kind: "defend",
        });
      } else if (looksLikeMonsterMiss) {
        effectIdRef.current += 1;
        newEffects.push({
          id: effectIdRef.current,
          anchor: activePos,
          kind: "miss",
        });
      } else if (looksLikeHeroMiss) {
        const tgt =
          state.pendingTargetIdx !== undefined
            ? state.monsters[state.pendingTargetIdx]
            : state.monsters.find((m) => !m.defeated);
        if (tgt) {
          effectIdRef.current += 1;
          newEffects.push({
            id: effectIdRef.current,
            anchor: tgt.position,
            airborne: !!MONSTERS[tgt.monsterId]?.airborne,
            kind: "miss",
          });
        }
      }
    }

    prevHitsRef.current = state.monsters.map((m) => m.hitsRemaining);
    prevLivesRef.current = state.heroLives;

    if (newEffects.length > 0) {
      setEffects((prevList) => [...prevList, ...newEffects]);
      // Auto-prune after the animation ends
      newEffects.forEach((e) => {
        setTimeout(() => {
          setEffects((cur) => cur.filter((x) => x.id !== e.id));
        }, 1500);
      });
    }
  }, [
    state.monsters,
    state.heroLives,
    state.log,
    state.pendingTargetIdx,
    state.companions,
    state.activeAttacker,
  ]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (state.phase === "companion-rolling") {
      // No party-wide attack animation here. Only the active attacker (who
      // just solved the puzzle) gets the lunge — triggered separately in
      // the MathPuzzle onSolved callback. Non-active companions only assist
      // narratively via the log; they don't physically lunge.
      timer = setTimeout(() => setState((s) => stepCompanionTurn(s)), 1100);
    } else if (state.phase === "monster-rolling") {
      // Animate the next-up monster lunging at the hero before transitioning
      // into the defense puzzle.
      const alive = state.monsters
        .map((m, i) => ({ m, i }))
        .filter((x) => !x.m.defeated);
      const next = alive[state.monsterIdxThisRound];
      if (next) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- staging the monster lunge animation before the engine step
        setAttackingMonsterIdx(next.i);
        setTimeout(() => setAttackingMonsterIdx(null), 380);
      }
      timer = setTimeout(() => setState((s) => enterMonsterAttack(s)), 900);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    state.phase,
    state.monsterIdxThisRound,
    state.companionIdxThisRound,
    state.companions,
    state.activeAttacker,
    state.monsters,
  ]);

  // Per-attack SFX: an attack landing (hit/crit) vs. missing (target dodges).
  // Scan the log lines ADDED this update from the end (not just the very last
  // entry): the killing blow appends a "victory" line in the same turn, so the
  // hit/crit that ended the battle is no longer the final entry — without this
  // the final attack would be silent and only the victory stinger would play.
  const prevLogLen = useRef<number | null>(null);
  useEffect(() => {
    if (prevLogLen.current === null) {
      prevLogLen.current = state.log.length; // don't replay pre-existing log
      return;
    }
    const fresh = state.log.slice(prevLogLen.current);
    prevLogLen.current = state.log.length;
    for (let i = fresh.length - 1; i >= 0; i--) {
      const t = fresh[i].tone;
      if (t === "hit" || t === "crit") {
        getAudio().playSfx(SFX.ATTACK);
        break;
      }
      if (t === "miss") {
        getAudio().playSfx(SFX.DODGE);
        break;
      }
    }
  }, [state.log]);

  // Battle-end stinger — fire once when the battle reaches a terminal phase.
  // Driven by `phase` (not the log tone): the "defeat" tone also marks a single
  // party member falling, whereas phase only flips on a full win/wipe. Delayed
  // so the killing-blow attack cue (above) is heard first, then the stinger.
  useEffect(() => {
    if (state.phase !== "victory" && state.phase !== "defeat") return;
    const key = state.phase === "victory" ? SFX.VICTORY : SFX.DEFEAT;
    const t = setTimeout(() => getAudio().playSfx(key), 450);
    return () => clearTimeout(t);
  }, [state.phase]);

  const heroPartyIds: (SpeakerId | CompanionId)[] = useMemo(
    () => [heroId, ...state.companions],
    [heroId, state.companions],
  );

  // Reorder so the active attacker takes the frontline slot (rightmost in
  // the party row — closest to the monsters), with the rest sliding back.
  // Active attacker also gets the top zIndex so they read as "in front".
  const partyOrder = useMemo(() => {
    const map: Record<AttackerId, SpeakerId | CompanionId> = {
      hero: heroId,
      scarecrow: "scarecrow",
      tinman: "tinman",
      lion: "lion",
    };
    const activeId = map[state.activeAttacker];
    if (!activeId || !heroPartyIds.includes(activeId)) return heroPartyIds;
    const rest = heroPartyIds.filter((id) => id !== activeId);
    return [...rest, activeId];
  }, [heroPartyIds, heroId, state.activeAttacker]);

  const activeHeroSlot: SpeakerId | CompanionId =
    state.activeAttacker === "hero" ? heroId : state.activeAttacker;
  const attackingLayerId: SpeakerId | CompanionId | null =
    attackingAttacker === null
      ? null
      : attackingAttacker === "hero"
        ? heroId
        : attackingAttacker;
  // Fallen party members render dimmed + grayscale just like defeated
  // monsters — the kid sees who is down at a glance.
  const fallenLayerIds = new Set<SpeakerId | CompanionId>(
    state.fallenAttackers.map((a) => (a === "hero" ? heroId : a)),
  );
  const heroLayers = partyOrder.map((id, i, arr) => ({
    id,
    base: characterImageBase(id),
    position:
      (HERO_POSITIONS[arr.length]?.[i] as StagePosition) ?? "far-left",
    scale: sizeScale(characterSize(id, characters)),
    // Keep all sprite z values BELOW the UI layer (z-50). Active gets the
    // top sprite slot so they read as "in front" of the rest of the party.
    z: id === activeHeroSlot ? 25 : 10 + (arr.length - i),
    defeated: fallenLayerIds.has(id),
    attacking:
      id === attackingLayerId ? ("right" as const) : undefined,
    // Defense reactions apply to the active attacker (the frontline), not
    // always to the hero — companions can be the one taking the blow now.
    hurting: id === activeHeroSlot && hurtingHero,
    dodging: id === activeHeroSlot && dodgingHero,
  }));

  const monsterLayers = state.monsters.map((m, i) => ({
    monsterId: m.monsterId,
    base:
      MONSTERS[m.monsterId]?.image ??
      `/stories/${storyId}/monsters/${m.monsterId}`,
    position: m.position,
    flip: false,
    defeated: m.defeated,
    airborne: MONSTERS[m.monsterId]?.airborne,
    scale: sizeScale(MONSTERS[m.monsterId]?.size),
    attacking:
      attackingMonsterIdx === i ? ("left" as const) : undefined,
    hurting: hurtingMonsterIdx === i,
  }));

  const aliveMonsters = state.monsters
    .map((m, i) => ({ ...m, index: i }))
    .filter((m) => !m.defeated);

  const isTerminal = state.phase === "victory" || state.phase === "defeat";

  // Hold the Victory/Defeat panel back ~0.5s after the battle resolves so the
  // final blow lands and registers before the result card pops in — appearing
  // the same frame the last monster falls reads as abrupt.
  const [showTerminal, setShowTerminal] = useState(false);
  useEffect(() => {
    if (!isTerminal) return;
    const t = setTimeout(() => setShowTerminal(true), 500);
    return () => clearTimeout(t);
  }, [isTerminal]);

  // Derive what (if any) puzzle is active. Two flavours: attack (hero is
  // hitting a monster) and defend (a monster is hitting the hero).
  type ActivePuzzle =
    | { mode: "attack"; monster: BattleState["monsters"][number] }
    | { mode: "defend"; monster: BattleState["monsters"][number] }
    | null;
  const activePuzzle: ActivePuzzle =
    state.phase === "hero-puzzle" && state.pendingTargetIdx !== undefined
      ? { mode: "attack", monster: state.monsters[state.pendingTargetIdx] }
      : state.phase === "hero-defending" &&
          state.defendingMonsterIdx !== undefined
        ? {
            mode: "defend",
            monster: state.monsters[state.defendingMonsterIdx],
          }
        : null;

  // Generate the challenge once per active puzzle. Doing it inline in JSX
  // would re-roll on every re-render (animation state, etc.), regenerating
  // the problem mid-solve. Memoizing on the puzzle's identity keeps the
  // question stable until a new puzzle opens. Difficulty is age-driven; the
  // category is auto-picked for the age tier.
  const activeChallenge = useMemo<Challenge | null>(() => {
    if (!activePuzzle) return null;
    return generateChallenge({ age, category: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-roll only on puzzle identity change
  }, [
    age,
    activePuzzle?.mode,
    activePuzzle?.monster.monsterId,
    state.activeAttacker,
    // Key on the target INSTANCE index too, so two monsters sharing a
    // monsterId each get a fresh roll instead of a cached one.
    state.pendingTargetIdx,
    state.defendingMonsterIdx,
  ]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink">
      <ComposedScene
        storyId={storyId}
        bg={setup.bg}
        characters={heroLayers}
        monsters={monsterLayers}
      />

      {/* Top bar — Party HP (left) | Monster chips | Settings (right).
          One row, justify-between so monsters bunch near the gear. */}
      <header
        className="absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-3 px-4 sm:px-6"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        {/* Left column: party HP icons + a bag below them (use items). */}
        <div className="flex flex-col items-start gap-2">
          <PartyHpRow
            party={["hero", ...state.companions]}
            active={state.activeAttacker}
            characterImageBase={characterImageBase}
            heroId={heroId}
            canSwap={state.phase === "hero-choose"}
            canAct={(a) => canAttackerAct(a, state)}
            partyLives={state.partyLives}
            partyMaxLives={state.partyMaxLives}
            fallenAttackers={state.fallenAttackers}
            onSwitch={(to) =>
              setState((s) => chooseHeroAction(s, { kind: "switch", to }))
            }
          />
          <BattleBag
            inventory={inventory}
            state={state}
            onUse={(itemId) =>
              setState((s) =>
                chooseHeroAction(s, { kind: "useItem", itemId }),
              )
            }
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-2">
          {state.monsters.map((m, i) => (
            <HitsBar
              key={`${m.monsterId}-${i}`}
              label={m.name}
              hitsRemaining={m.hitsRemaining}
              maxHits={m.maxHits}
              defeated={m.defeated}
              portraitBase={
                MONSTERS[m.monsterId]?.image ??
                `/stories/${storyId}/monsters/${m.monsterId}`
              }
            />
          ))}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open settings"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-paper/15 text-ink-soft/80 ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper/40 hover:text-ink active:scale-90"
            >
              <GearSix size={22} weight="duotone" />
            </button>
          )}
        </div>
      </header>

      {/* Floating combat effects — damage numbers / miss labels */}
      <AnimatePresence>
        {effects.map((eff) => (
          <DamageNumber key={eff.id} effect={eff} />
        ))}
      </AnimatePresence>

      {/* Bottom area — actions only (no narration log) */}
      <div
        className="absolute inset-x-0 bottom-0 z-50 flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {state.phase === "hero-choose" && (
          <ActionRow
            monsters={aliveMonsters}
            onAction={(a) => setState((s) => chooseHeroAction(s, a))}
          />
        )}

        {isTerminal && showTerminal && (
          <TerminalPanel
            outcome={
              state.phase === "victory"
                ? "victory"
                : state.phase === "defeat"
                  ? "defeat"
                  : "escaped"
            }
            victoryItems={victoryItems}
            rewards={state.rewards}
            onRetry={onRetry}
            onContinue={() =>
              onComplete({
                outcome:
                  state.phase === "victory"
                    ? "victory"
                    : state.phase === "defeat"
                      ? "defeat"
                      : "escaped",
                rewards: state.rewards,
                partyHp: { ...state.partyLives },
                fallenAttackers: [...state.fallenAttackers],
                itemsConsumed: [...state.itemsConsumed],
              })
            }
          />
        )}
      </div>

      {/* Math puzzle overlay — attack OR defend */}
      <AnimatePresence>
        {activePuzzle && timerFrozen(state, activePuzzle.mode) && (
          <motion.div
            key="time-frozen"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed left-1/2 top-6 z-[61] -translate-x-1/2 rounded-pill bg-ink/80 px-4 py-1.5 text-sm font-semibold text-paper backdrop-blur"
          >
            ⏸️ Time stopped — no limit!
          </motion.div>
        )}
        {activePuzzle && activeChallenge && activePuzzle.mode === "attack" && (
          <EducationalChallenge
            mode="attack"
            withTimer={!timerFrozen(state, "attack")}
            challenge={activeChallenge}
            targetName={activePuzzle.monster.name}
            attackerLabel={attackerName(state.activeAttacker)}
            streak={state.streak}
            onSolved={(correct, durationMs) => {
              if (!correct && activeChallenge)
                recordWrongChallenge?.(activeChallenge);
              triggerAttackerLunge(state.activeAttacker);
              setState((s) =>
                resolvePuzzleAttack(s, { correct, durationMs }),
              );
            }}
          />
        )}
        {activePuzzle && activeChallenge && activePuzzle.mode === "defend" && (
          <EducationalChallenge
            mode="defend"
            withTimer={!timerFrozen(state, "defend")}
            challenge={activeChallenge}
            targetName={activePuzzle.monster.name}
            streak={0}
            onSolved={(correct, durationMs) => {
              if (!correct && activeChallenge)
                recordWrongChallenge?.(activeChallenge);
              if (correct) {
                // Successful defense — sprite weaves side-to-side. The
                // damage-taken blink is wired separately via the hero
                // lives-diff useEffect (fires when lives drop).
                setDodgingHero(true);
                setTimeout(() => setDodgingHero(false), 550);
              }
              setState((s) =>
                resolveDefense(s, { correct, durationMs }),
              );
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

/**
 * Top-header party HP row. ALWAYS visible during a battle — shows every
 * member's portrait + HP pips so the kid can see at a glance who's hurt.
 * Tap-to-swap is enabled only during `hero-choose` (otherwise the engine
 * is mid-resolve and a swap would be confusing).
 */
function PartyHpRow({
  party,
  active,
  characterImageBase,
  heroId,
  canSwap,
  canAct,
  partyLives,
  partyMaxLives,
  fallenAttackers,
  onSwitch,
}: {
  party: AttackerId[];
  active: AttackerId;
  characterImageBase: (id: SpeakerId | CompanionId) => string;
  heroId: SpeakerId;
  canSwap: boolean;
  canAct: (id: AttackerId) => boolean;
  partyLives: Record<AttackerId, number>;
  partyMaxLives: Record<AttackerId, number>;
  fallenAttackers: AttackerId[];
  onSwitch: (to: AttackerId) => void;
}) {
  // Show "Tap to switch" hint under the row whenever any other party
  // member is selectable — i.e. we're in hero-choose, the player has
  // companions, and at least one of them is clickable.
  const hasSwitchTarget =
    canSwap &&
    party.some(
      (id) =>
        id !== active && !fallenAttackers.includes(id) && canAct(id),
    );
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {party.map((id) => {
          const fallen = fallenAttackers.includes(id);
          const selected = id === active;
          const clickable = canSwap && !fallen && canAct(id) && !selected;
          const imageBase =
            id === "hero" ? characterImageBase(heroId) : characterImageBase(id);
          const hp = partyLives[id] ?? 0;
          const maxHp = partyMaxLives[id] ?? 3;
          return (
            <button
              key={id}
              type="button"
              disabled={!clickable}
              onClick={() => onSwitch(id)}
              className={`flex h-11 items-center gap-1.5 rounded-pill px-1.5 ring-1 backdrop-blur transition-all active:scale-95 ${
                selected
                  ? "bg-accent-deep text-paper ring-accent shadow-button"
                  : fallen
                    ? "bg-paper-deep/40 text-ink-soft/30 ring-ink-soft/10 opacity-60 grayscale"
                    : "bg-paper/85 text-ink ring-ink-soft/10 hover:bg-paper"
              } ${!clickable ? "cursor-default" : ""}`}
            >
              <span className="relative">
                <span
                  className="block h-8 w-8 overflow-hidden rounded-full"
                  style={{
                    backgroundImage: `url(${assetUrl(`${imageBase}.webp`)})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                  }}
                />
                {fallen && (
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center text-ruby"
                  >
                    <XIcon size={20} weight="bold" />
                  </span>
                )}
              </span>
              <span className="flex flex-col items-start gap-0.5 pr-1.5">
                <span className="text-xs font-semibold leading-none">
                  {id === "hero" ? "Me" : prettyCompShort(id as CompanionId)}
                </span>
                {!fallen && (
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: maxHp }).map((_, i) => (
                      <span
                        key={i}
                        className={`block h-1.5 w-1.5 rounded-full ${
                          i < hp
                            ? selected
                              ? "bg-paper"
                              : "bg-ruby"
                            : selected
                              ? "bg-paper/30"
                              : "bg-ink-soft/25"
                        }`}
                      />
                    ))}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {hasSwitchTarget && (
        <span
          className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-paper"
          style={{
            textShadow:
              "0 2px 4px rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.95)",
          }}
          aria-hidden
        >
          Tap to switch
        </span>
      )}
    </div>
  );
}

function ActionRow({
  monsters,
  onAction,
}: {
  monsters: { monsterId: string; name: string; index: number }[];
  onAction: (a: HeroAction) => void;
}) {
  // Single target → one big "Attack" button. Multiple targets → render
  // one "Attack <name>" button per monster so the player picks in one tap.
  if (monsters.length === 1) {
    return (
      <div className="flex justify-center">
        <BattleActionButton
          icon={<Sword size={22} weight="duotone" />}
          label="Attack"
          onClick={() =>
            onAction({ kind: "attack", targetIdx: monsters[0].index })
          }
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {monsters.map((m) => (
        <BattleActionButton
          key={`${m.monsterId}-${m.index}`}
          icon={<Sword size={22} weight="duotone" />}
          label={`Attack ${m.name}`}
          onClick={() => onAction({ kind: "attack", targetIdx: m.index })}
        />
      ))}
    </div>
  );
}

/**
 * Consumable items usable this turn (hero-choose). Generic over effect
 * kind: it lists any item with a battle-context effect and lets the engine
 * (`canUseItem`) decide enablement — no per-effect UI branches, so future
 * battle items appear here automatically.
 */
/**
 * In-battle bag — a Backpack icon (under the party HP, top-left) that opens a
 * small panel listing the player's items. Non-event items (`itemUsableIn`
 * "battle" → heal, etc.) are usable when it's the hero's turn and the effect
 * applies (`canUseItem`); event/story items are shown greyed for reference.
 */
function BattleBag({
  inventory,
  state,
  onUse,
}: {
  inventory: string[];
  state: BattleState;
  onUse: (itemId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Available count per id = inventory minus what's already been spent.
  const counts = new Map<string, number>();
  for (const id of inventory) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of state.itemsConsumed) {
    counts.set(id, (counts.get(id) ?? 0) - 1);
  }
  const entries = [...counts.keys()]
    .map((id) => ({ id, item: getItem(id), avail: counts.get(id) ?? 0 }))
    .filter((e) => e.avail > 0 && !!e.item);
  const heroTurn = state.phase === "hero-choose";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open bag"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-paper/85 text-ink ring-1 ring-ink-soft/10 shadow-button backdrop-blur transition-all hover:bg-paper active:scale-95"
      >
        <Backpack size={22} weight="duotone" className="text-accent" />
      </button>

      {open && (
        <>
          {/* iOS-safe outside-tap close — a transparent backdrop catches the
              tap (pointerdown listeners don't bubble from non-interactive
              elements on iOS). */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-card-lg bg-paper/95 p-2 shadow-overlay ring-1 ring-ink-soft/15 backdrop-blur">
            {entries.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-ink-soft/70">
                Your bag is empty.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {entries.map(({ id, item, avail }) => {
                  if (!item) return null;
                  const usable = itemUsableIn(item, "battle");
                  const enabled = usable && heroTurn && canUseItem(state, item);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        disabled={!enabled}
                        data-sfx="ruby-click"
                        onClick={() => {
                          onUse(id);
                          setOpen(false);
                        }}
                        title={
                          !usable
                            ? "Story item — used when the moment comes"
                            : !heroTurn
                              ? "Wait for your turn"
                              : enabled
                                ? item.description
                                : "Can't use right now"
                        }
                        className="flex w-full items-center gap-2 rounded-card px-2 py-1.5 text-left text-sm text-ink transition-colors enabled:hover:bg-paper-deep/60 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="text-lg" aria-hidden>
                          {item.icon ?? "🎁"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {item.name}
                          {avail > 1 ? ` ×${avail}` : ""}
                        </span>
                        <span className="shrink-0 text-xs text-ink-soft">
                          {usable ? effectLabel(item.effect) : "Story"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BattleActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex min-h-14 min-w-56 items-center justify-center gap-2 rounded-pill bg-paper/75 px-10 text-lg font-semibold text-ink ring-1 ring-ink-soft/15 shadow-button backdrop-blur-sm transition-all hover:bg-paper/90 hover:-translate-y-0.5 hover:shadow-button-hover hover:ring-accent/50 active:translate-y-0 active:scale-[0.98] active:shadow-button-pressed sm:min-w-64"
    >
      <span className="text-accent-deep">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function TerminalPanel({
  outcome,
  victoryItems,
  rewards,
  onContinue,
  onRetry,
}: {
  outcome: "victory" | "defeat" | "escaped";
  victoryItems?: string[];
  rewards: string[];
  onContinue: () => void;
  /** Defeat only — "Try again" restarts the battle. When absent, only the
   *  single "Leave the story" path is offered. */
  onRetry?: () => void;
}) {
  // Loot = monster drops (`rewards`) + encounter-level drops on victory.
  const loot =
    outcome === "victory" ? [...rewards, ...(victoryItems ?? [])] : rewards;
  // A random "the way is clear" outro line for the victory subtitle, stable
  // for this panel's lifetime. eslint-disable-next-line react-hooks/purity --
  // one-shot seed for a freshly mounted terminal panel.
  // eslint-disable-next-line react-hooks/purity
  const outroSeed = useMemo(() => Math.floor(Math.random() * 1000), []);
  const title =
    outcome === "victory"
      ? "Victory!"
      : outcome === "escaped"
        ? "You got away."
        : "You fell…";
  const subtitle =
    outcome === "victory"
      ? encounterOutroLine(outroSeed)
      : outcome === "escaped"
        ? "Your friends help you find your breath."
        : "Glinda's blessing carries you to safety.";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-card-lg bg-paper/55 p-5 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur">
      <p className="font-handwritten text-3xl text-accent-deep">{title}</p>
      <p className="text-base text-ink-soft">{subtitle}</p>
      {loot.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-sm text-ink-soft">Loot:</span>
          {countItems(loot).map(({ id, count }) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-pill bg-paper-deep/80 px-2.5 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/15"
            >
              <span aria-hidden>{itemIcon(id)}</span>
              <span>{prettyItem(id)}</span>
              {count > 1 && (
                <span className="ml-0.5 text-ink-soft">×{count}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {outcome === "defeat" && onRetry ? (
        // Defeat → let the player retry the battle or step out (progress kept).
        <div className="mt-1 flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-14 items-center justify-center rounded-pill bg-accent-deep px-8 text-lg font-semibold text-paper shadow-button transition-all active:scale-[0.98] sm:min-w-48"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex min-h-14 items-center justify-center rounded-pill bg-paper-deep/70 px-8 text-base font-medium text-ink ring-1 ring-ink-soft/15 transition-all hover:bg-paper-deep active:scale-[0.98] sm:min-w-48"
          >
            Leave the story
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          className="mt-1 inline-flex min-h-14 min-w-56 items-center justify-center rounded-pill bg-accent-deep px-10 text-lg font-semibold text-paper shadow-button transition-all active:scale-[0.98] sm:min-w-64"
        >
          Continue
        </button>
      )}
    </div>
  );
}


function prettyCompShort(id: CompanionId): string {
  switch (id) {
    case "lion":
      return "Lion";
    case "scarecrow":
      return "Scarecrow";
    case "tinman":
      return "Tin Man";
  }
}

function countItems(items: string[]): Array<{ id: string; count: number }> {
  const map = new Map<string, number>();
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1);
  return Array.from(map.entries()).map(([id, count]) => ({ id, count }));
}
