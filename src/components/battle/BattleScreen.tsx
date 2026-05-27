"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { GearSix, Sword } from "@phosphor-icons/react";

import {
  attackerName,
  canAttackerAct,
  chooseHeroAction,
  enterMonsterAttack,
  puzzleKindFor,
  resolveDefense,
  resolvePuzzleAttack,
  setupBattle,
  stepCompanionTurn,
  type AttackerId,
  type BattleState,
  type HeroAction,
  type SetupArgs,
} from "@/lib/battle-engine";
import { getAudio, SFX } from "@/lib/audio-engine";
import { MONSTERS } from "@/data/monsters";
import { prettyItem } from "@/data/items";
import { characterSize, sizeScale } from "@/lib/sprite-size";

import { ComposedScene, type StagePosition } from "../scene/ComposedScene";
import { HitsBar } from "./HpBar";
import { MathPuzzle } from "./MathPuzzle";
import { DamageNumber, type FloatingEffect } from "./DamageNumber";

import type { CompanionId, PartyHp, SpeakerId } from "@/types/story";

interface Props {
  setup: SetupArgs;
  storyId: string;
  characterImageBase: (id: SpeakerId | CompanionId) => string;
  onComplete: (result: {
    outcome: "victory" | "defeat" | "escaped";
    rewards: string[];
    /** Final HP per attacker — carries into the persistent PlayState. */
    partyHp: PartyHp;
    /** Attackers KO'd this battle, appended to PlayState.fallenAttackers. */
    fallenAttackers: AttackerId[];
  }) => void;
  /** Open the global Settings modal from inside the battle. */
  onOpenSettings?: () => void;
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
  onComplete,
  onOpenSettings,
}: Props) {
  const [state, setState] = useState<BattleState>(() => setupBattle(setup));
  const [effects, setEffects] = useState<FloatingEffect[]>([]);
  const prevHitsRef = useRef<number[]>([]);
  const prevLivesRef = useRef<number>(setup.partyHp.hero ?? setup.partyMaxHp.hero ?? 3);
  const effectIdRef = useRef(0);

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

  // Diff the engine state vs the previous render to spawn floating
  // numbers above the target whose HP/hits changed.
  useEffect(() => {
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

  const lastLog = state.log[state.log.length - 1];
  useEffect(() => {
    if (!lastLog) return;
    if (lastLog.tone === "hit" || lastLog.tone === "crit") {
      getAudio().playSfx(SFX.PAGE_TURN);
    } else if (lastLog.tone === "victory") {
      getAudio().playSfx(SFX.MEDAL);
    }
  }, [lastLog?.text, lastLog?.tone, lastLog]);

  const heroPartyIds: (SpeakerId | CompanionId)[] = useMemo(
    () => ["dorothy", ...state.companions],
    [state.companions],
  );

  // Reorder so the active attacker takes the frontline slot (rightmost in
  // the party row — closest to the monsters), with the rest sliding back.
  // Active attacker also gets the top zIndex so they read as "in front".
  const partyOrder = useMemo(() => {
    const map: Record<AttackerId, SpeakerId | CompanionId> = {
      hero: "dorothy",
      scarecrow: "scarecrow",
      tinman: "tinman",
      lion: "lion",
    };
    const activeId = map[state.activeAttacker];
    if (!activeId || !heroPartyIds.includes(activeId)) return heroPartyIds;
    const rest = heroPartyIds.filter((id) => id !== activeId);
    return [...rest, activeId];
  }, [heroPartyIds, state.activeAttacker]);

  const activeHeroSlot: SpeakerId | CompanionId =
    state.activeAttacker === "hero" ? "dorothy" : state.activeAttacker;
  const attackingLayerId: SpeakerId | CompanionId | null =
    attackingAttacker === null
      ? null
      : attackingAttacker === "hero"
        ? "dorothy"
        : attackingAttacker;
  // Fallen party members render dimmed + grayscale just like defeated
  // monsters — the kid sees who is down at a glance.
  const fallenLayerIds = new Set<SpeakerId | CompanionId>(
    state.fallenAttackers.map((a) => (a === "hero" ? "dorothy" : a)),
  );
  const heroLayers = partyOrder.map((id, i, arr) => ({
    id,
    base: characterImageBase(id),
    position:
      (HERO_POSITIONS[arr.length]?.[i] as StagePosition) ?? "far-left",
    scale: sizeScale(characterSize(id)),
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
    base: `/stories/${storyId}/monsters/${m.monsterId}`,
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

  return (
    <div className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden bg-ink">
      <ComposedScene
        storyId={storyId}
        bg={setup.bg}
        characters={heroLayers}
        monsters={monsterLayers}
      />

      {/* Top bar — Party HP row (each member always visible) + Round + Settings */}
      <header
        className="absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-3 px-4 sm:px-6"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <PartyHpRow
          party={["hero", ...state.companions]}
          active={state.activeAttacker}
          characterImageBase={characterImageBase}
          canSwap={state.phase === "hero-choose"}
          canAct={(a) => canAttackerAct(a, state)}
          partyLives={state.partyLives}
          partyMaxLives={state.partyMaxLives}
          fallenAttackers={state.fallenAttackers}
          onSwitch={(to) =>
            setState((s) => chooseHeroAction(s, { kind: "switch", to }))
          }
        />
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 rounded-pill bg-paper/85 px-3 py-1.5 ring-1 ring-ink-soft/10 backdrop-blur">
            <span className="font-handwritten text-sm text-accent-deep">
              Round
            </span>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {state.round}
            </span>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open settings"
              className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper/85 text-ink-soft ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper hover:text-ink active:scale-90"
            >
              <GearSix size={22} weight="duotone" />
            </button>
          )}
        </div>
      </header>

      {/* Monster hit pips */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-50 flex flex-wrap items-start justify-end gap-2 px-3 sm:px-6">
        {state.monsters.map((m, i) => (
          <HitsBar
            key={`${m.monsterId}-${i}`}
            label={m.name}
            hitsRemaining={m.hitsRemaining}
            maxHits={m.maxHits}
            defeated={m.defeated}
          />
        ))}
      </div>

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

        {isTerminal && (
          <TerminalPanel
            outcome={
              state.phase === "victory"
                ? "victory"
                : state.phase === "defeat"
                  ? "defeat"
                  : "escaped"
            }
            rewards={state.rewards}
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
              })
            }
          />
        )}
      </div>

      {/* Math puzzle overlay — attack OR defend */}
      <AnimatePresence>
        {activePuzzle && activePuzzle.mode === "attack" && (
          <MathPuzzle
            targetName={activePuzzle.monster.name}
            kind={puzzleKindFor(state.activeAttacker, activePuzzle.monster)}
            attackerLabel={attackerName(state.activeAttacker)}
            streak={state.streak}
            onSolved={(correct, durationMs) => {
              triggerAttackerLunge(state.activeAttacker);
              setState((s) =>
                resolvePuzzleAttack(s, { correct, durationMs }),
              );
            }}
          />
        )}
        {activePuzzle && activePuzzle.mode === "defend" && (
          <MathPuzzle
            mode="defend"
            targetName={activePuzzle.monster.name}
            kind={activePuzzle.monster.puzzleKind}
            streak={0}
            onSolved={(correct, durationMs) => {
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
  canSwap: boolean;
  canAct: (id: AttackerId) => boolean;
  partyLives: Record<AttackerId, number>;
  partyMaxLives: Record<AttackerId, number>;
  fallenAttackers: AttackerId[];
  onSwitch: (to: AttackerId) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {party.map((id) => {
        const fallen = fallenAttackers.includes(id);
        const selected = id === active;
        const clickable = canSwap && !fallen && canAct(id) && !selected;
        const imageBase =
          id === "hero" ? characterImageBase("dorothy") : characterImageBase(id);
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
                  backgroundImage: `url(${imageBase}.webp)`,
                  backgroundSize: "cover",
                  backgroundPosition: "center top",
                }}
              />
              {fallen && (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-base"
                >
                  💀
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
  );
}

function ActionRow({
  monsters,
  onAction,
}: {
  monsters: { monsterId: string; name: string; index: number }[];
  onAction: (a: HeroAction) => void;
}) {
  const [pickingTarget, setPickingTarget] = useState(false);

  if (pickingTarget) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p
          className="text-sm font-semibold text-paper"
          style={{ textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
        >
          Attack which?
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {monsters.map((m) => (
            <button
              key={`${m.monsterId}-${m.index}`}
              type="button"
              onClick={() => {
                onAction({ kind: "attack", targetIdx: m.index });
                setPickingTarget(false);
              }}
              className="inline-flex min-h-12 items-center justify-center rounded-pill bg-paper/80 px-5 text-base font-semibold text-ink shadow-button ring-1 ring-ink-soft/15 backdrop-blur transition-all hover:bg-paper/95 active:scale-95"
            >
              {m.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPickingTarget(false)}
            className="inline-flex min-h-12 items-center justify-center rounded-pill bg-paper-deep/50 px-5 text-base text-ink-soft ring-1 ring-ink-soft/15 backdrop-blur transition-all active:scale-95"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <BattleActionButton
        icon={<Sword size={22} weight="duotone" />}
        label="Attack"
        onClick={() => {
          if (monsters.length === 1) {
            onAction({ kind: "attack", targetIdx: monsters[0].index });
          } else {
            setPickingTarget(true);
          }
        }}
      />
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
      className="group inline-flex min-h-14 items-center justify-center gap-2 rounded-pill bg-paper/75 px-7 text-lg font-semibold text-ink ring-1 ring-ink-soft/15 shadow-button backdrop-blur-sm transition-all hover:bg-paper/90 hover:-translate-y-0.5 hover:shadow-button-hover hover:ring-accent/50 active:translate-y-0 active:scale-[0.98] active:shadow-button-pressed sm:min-w-44"
    >
      <span className="text-accent-deep">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function TerminalPanel({
  outcome,
  rewards,
  onContinue,
}: {
  outcome: "victory" | "defeat" | "escaped";
  rewards: string[];
  onContinue: () => void;
}) {
  const title =
    outcome === "victory"
      ? "Victory!"
      : outcome === "escaped"
        ? "You got away."
        : "You fell…";
  const subtitle =
    outcome === "victory"
      ? "The path is clear ahead."
      : outcome === "escaped"
        ? "Your friends help you find your breath."
        : "Glinda's blessing carries you to safety.";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-card-lg bg-paper/80 p-5 shadow-overlay ring-1 ring-ink-soft/10 backdrop-blur">
      <p className="font-handwritten text-3xl text-accent-deep">{title}</p>
      <p className="text-base text-ink-soft">{subtitle}</p>
      {rewards.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-sm text-ink-soft">Loot:</span>
          {countItems(rewards).map(({ id, count }) => (
            <span
              key={id}
              className="rounded-pill bg-paper-deep/80 px-2.5 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink-soft/15"
            >
              {prettyItem(id)}
              {count > 1 && (
                <span className="ml-1 text-ink-soft">×{count}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onContinue}
        className="mt-1 inline-flex min-h-12 items-center justify-center rounded-pill bg-accent-deep px-8 text-base font-semibold text-paper shadow-button transition-all active:scale-[0.98]"
      >
        Continue
      </button>
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
