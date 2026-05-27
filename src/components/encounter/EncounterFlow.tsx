"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import type {
  AttackerId,
  CompanionId,
  CompanionMoods,
  Hero,
  PartyHp,
  SpeakerId,
} from "@/types/story";
import type {
  EncounterDef,
  EncounterRewards,
  StoryChoice,
} from "@/types/encounter";

import { BattleScreen } from "../battle/BattleScreen";
import { ComposedScene, type StagePosition } from "../scene/ComposedScene";
import { PatternPuzzle } from "./PatternPuzzle";
import { MONSTERS } from "@/data/monsters";
import { prettyItem } from "@/data/items";
import { characterSize, sizeScale } from "@/lib/sprite-size";

function monsterSlots(count: number): StagePosition[] {
  // Keep the centre of the canvas free for narration — push monsters to
  // the right edge.
  if (count <= 1) return ["far-right"];
  if (count === 2) return ["right", "far-right"];
  if (count === 3) return ["right-center", "right", "far-right"];
  return ["center", "right-center", "right", "far-right"].slice(0, count) as StagePosition[];
}

export interface EncounterResult {
  encounterId: string;
  outcome: "victory" | "defeat" | "escaped";
  /** Final HP per attacker — null for non-battle encounters (no HP change). */
  partyHp: PartyHp | null;
  /** Attackers KO'd this encounter — appended to PlayState.fallenAttackers. */
  fallenAttackers: AttackerId[];
  itemsGained: string[];
  medalId?: string;
  moodBoost?: { companionId: CompanionId; delta: number }[];
  /** Encounter may force a transition to a specific main scene. */
  forceNextSceneId?: string;
}

interface Props {
  encounter: EncounterDef;
  storyId: string;
  hero: Hero;
  companions: CompanionId[];
  companionMoods: CompanionMoods;
  /** Persistent HP carried in from PlayState. */
  partyHp: PartyHp;
  partyMaxHp: PartyHp;
  fallenAttackers: AttackerId[];
  /** Resolves to an image base path WITHOUT extension. `mode` lets the
   *  caller swap in the combat-stance art for the battle phase only —
   *  intro/outro should stay in the default stance. */
  characterImageBase: (
    id: SpeakerId | CompanionId,
    mode?: "default" | "battle",
  ) => string;
  onComplete: (result: EncounterResult) => void;
  /** Open the parent's Settings modal — surfaced inside battle. */
  onOpenSettings?: () => void;
}

type Phase = "intro" | "body" | "choosing" | "puzzle" | "outro";

export function EncounterFlow({
  encounter,
  storyId,
  hero,
  companions,
  companionMoods,
  partyHp,
  partyMaxHp,
  fallenAttackers,
  characterImageBase,
  onComplete,
  onOpenSettings,
}: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [outcome, setOutcome] =
    useState<"victory" | "defeat" | "escaped" | null>(null);
  /** Active story-choice (if a choices array is set). */
  const [pickedChoice, setPickedChoice] = useState<StoryChoice | null>(null);
  /** Outcome of the picked choice's puzzle (if any). */
  const [puzzleSucceeded, setPuzzleSucceeded] = useState<boolean | null>(null);

  // Intro / outro use the default stance — battle stance only inside the
  // combat phase (BattleScreen below).
  const heroLayer = {
    id: "dorothy" as SpeakerId,
    base: characterImageBase("dorothy", "default"),
    position: "far-left" as const,
    scale: sizeScale(characterSize("dorothy")),
  };

  // displayMonsters (intro/outro sprite display) takes priority. If a
  // battle encounter doesn't set it, fall back to the battle monsterIds.
  const monsterIds =
    encounter.displayMonsters ??
    (encounter.body.kind === "battle" ? encounter.body.monsterIds : []);
  const monsterPositions = monsterSlots(monsterIds.length);
  const monsterLayers = monsterIds.map((id, i) => ({
    monsterId: id,
    base: `/stories/${storyId}/monsters/${id}`,
    position: monsterPositions[i] ?? "right",
    flip: false,
    airborne: MONSTERS[id]?.airborne,
    scale: sizeScale(MONSTERS[id]?.size),
    alt: MONSTERS[id]?.name ?? id,
  }));

  function startBody() {
    if (encounter.body.kind === "story") {
      const choices = encounter.body.choices;
      if (choices && choices.length > 0) {
        // Player picks a choice (and possibly solves a puzzle)
        setPhase("choosing");
      } else {
        // No choices → auto-victory
        setOutcome("victory");
        setPhase("outro");
      }
    } else {
      setPhase("body");
    }
  }

  function pickChoice(choice: StoryChoice) {
    setPickedChoice(choice);
    if (choice.puzzle) {
      setPhase("puzzle");
    } else {
      // No puzzle — direct success
      setPuzzleSucceeded(true);
      setOutcome("victory");
      setPhase("outro");
    }
  }

  function handlePuzzleSolved(correct: boolean) {
    setPuzzleSucceeded(correct);
    setOutcome("victory");
    setPhase("outro");
  }

  function isChoiceLocked(choice: StoryChoice): boolean {
    const req = choice.requires;
    if (!req) return false;
    if (req.companion && !companions.includes(req.companion)) return true;
    return false;
  }

  /**
   * Resolve which rewards block to apply. Choice-specific rewards take
   * priority over the encounter-level rewards. If the picked choice ran a
   * puzzle and the player failed, fall back to the choice's `onFail.rewards`.
   */
  function effectiveRewards(): EncounterRewards {
    if (pickedChoice) {
      if (puzzleSucceeded === false && pickedChoice.onFail?.rewards) {
        return pickedChoice.onFail.rewards;
      }
      if (pickedChoice.rewards) return pickedChoice.rewards;
    }
    return encounter.rewards;
  }

  function completeWith(res: {
    outcome: "victory" | "defeat" | "escaped";
    /** Battle encounters supply the post-battle party state. Story (no-HP)
     *  encounters pass `null` → caller leaves PlayState.partyHp unchanged. */
    partyHp: PartyHp | null;
    fallenAttackers: AttackerId[];
  }) {
    const forceNextSceneId =
      res.outcome === "victory"
        ? encounter.nextSceneOnVictory
        : res.outcome === "defeat"
          ? encounter.nextSceneOnDefeat
          : undefined;

    const rewards = effectiveRewards();

    onComplete({
      encounterId: encounter.id,
      outcome: res.outcome,
      partyHp: res.partyHp,
      fallenAttackers: res.fallenAttackers,
      itemsGained:
        res.outcome === "victory" ? rewards.victoryItems ?? [] : [],
      medalId: res.outcome === "victory" ? rewards.medalId : undefined,
      moodBoost: res.outcome === "victory" ? rewards.moodBoost : undefined,
      forceNextSceneId,
    });
  }

  function finishOutro() {
    if (!outcome) return;
    // Story encounters don't change HP — pass null so the caller leaves it
    // alone. Battle encounters route through BattleScreen.onComplete instead.
    completeWith({ outcome, partyHp: null, fallenAttackers });
  }

  // Render the right phase body. All three phases share a single outer
  // motion wrapper (defined below) so the OVERLAY fades in on mount and
  // out on unmount — visible as a cross-fade from / back to the main scene.
  let body: React.ReactNode = null;

  if (phase === "intro") {
    body = (
      <>
        <ComposedScene
          storyId={storyId}
          bg={encounter.intro.bg}
          characters={[heroLayer]}
          monsters={monsterLayers}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-5 px-4 pb-6 sm:px-6 sm:pb-8"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <p
            className="mx-auto max-w-3xl text-center text-2xl font-semibold leading-snug text-paper text-balance sm:text-3xl"
            style={{
              textShadow:
                "0 5px 18px rgba(20,12,4,0.85), 0 3px 6px rgba(20,12,4,0.95)",
              WebkitTextStroke: "2.5px rgba(20,12,4,0.7)",
              paintOrder: "stroke fill",
            }}
          >
            {encounter.intro.narration}
          </p>
          <button
            type="button"
            onClick={startBody}
            className="inline-flex min-h-14 items-center justify-center rounded-pill bg-accent-deep px-9 text-lg font-semibold text-paper shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:scale-[0.98]"
          >
            {encounter.body.kind === "battle" ? "Ready!" : "Approach"}
          </button>
        </div>
      </>
    );
  } else if (phase === "choosing" && encounter.body.kind === "story" && encounter.body.choices) {
    body = (
      <>
        <ComposedScene
          storyId={storyId}
          bg={encounter.intro.bg}
          characters={[heroLayer]}
          monsters={monsterLayers}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-4 px-4 pb-6 sm:px-6 sm:pb-8"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <p
            className="mx-auto max-w-3xl text-center text-xl font-semibold leading-snug text-paper text-balance sm:text-2xl"
            style={{
              textShadow:
                "0 5px 18px rgba(20,12,4,0.85), 0 3px 6px rgba(20,12,4,0.95)",
              WebkitTextStroke: "2px rgba(20,12,4,0.7)",
              paintOrder: "stroke fill",
            }}
          >
            {encounter.intro.narration}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {encounter.body.choices.map((c) => {
              const locked = isChoiceLocked(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={locked}
                  onClick={() => pickChoice(c)}
                  className={`inline-flex min-h-14 items-center justify-center rounded-pill px-6 text-base font-semibold shadow-button transition-all ${
                    locked
                      ? "bg-paper/40 text-ink-soft/40 cursor-not-allowed"
                      : "bg-paper/90 text-ink hover:-translate-y-0.5 hover:bg-paper hover:shadow-button-hover active:scale-[0.98]"
                  }`}
                >
                  {c.label}
                  {locked && <span className="ml-2 text-xs">🔒</span>}
                  {c.puzzle && !locked && (
                    <span className="ml-2 rounded-pill bg-accent/30 px-1.5 text-xs text-accent-deep">
                      puzzle
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  } else if (phase === "puzzle" && pickedChoice?.puzzle) {
    body = (
      <>
        <ComposedScene
          storyId={storyId}
          bg={encounter.intro.bg}
          characters={[heroLayer]}
          monsters={monsterLayers}
        />
        <PatternPuzzle
          puzzle={pickedChoice.puzzle}
          onSolved={handlePuzzleSolved}
        />
      </>
    );
  } else if (phase === "body" && encounter.body.kind === "battle") {
    body = (
      <BattleScreen
        storyId={storyId}
        characterImageBase={(id) => characterImageBase(id, "battle")}
        onOpenSettings={onOpenSettings}
        setup={{
          bg: encounter.intro.bg,
          monsterIds: encounter.body.monsterIds,
          partyHp,
          partyMaxHp,
          fallenAttackers,
          companions,
          companionMoods,
          introNarration: encounter.intro.narration,
        }}
        onComplete={(res) => {
          // Skip the outro screen for battles — the in-battle TerminalPanel
          // already shows Victory/Defeat + loot. Going straight to the next
          // main scene avoids a near-duplicate Continue page.
          completeWith({
            outcome: res.outcome,
            partyHp: res.partyHp,
            fallenAttackers: res.fallenAttackers,
          });
        }}
      />
    );
  }

  // Outro (story-encounter only — battle skips this)
  if (phase === "outro" && outcome) {
    const outroKey =
      outcome === "victory"
        ? "victory"
        : outcome === "defeat"
          ? "defeat"
          : "escape";
    // Choice-specific narration wins. Failed puzzle uses onFail.outroNarration.
    const choiceLine =
      pickedChoice &&
      (puzzleSucceeded === false && pickedChoice.onFail?.outroNarration
        ? pickedChoice.onFail.outroNarration
        : pickedChoice.outroNarration);
    const outroLine =
      choiceLine ?? encounter.outro[outroKey] ?? encounter.outro.victory;
    void hero; // reserved for future hero-name interpolation in outro
    body = (
      <>
        <ComposedScene
          storyId={storyId}
          bg={encounter.intro.bg}
          characters={[heroLayer]}
          monsters={[]}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-5 px-4 pb-6 sm:px-6 sm:pb-8"
          style={{
            paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          }}
        >
          <p
            className="mx-auto max-w-3xl text-center text-2xl font-semibold leading-snug text-paper text-balance sm:text-3xl"
            style={{
              textShadow:
                "0 5px 18px rgba(20,12,4,0.85), 0 3px 6px rgba(20,12,4,0.95)",
              WebkitTextStroke: "2.5px rgba(20,12,4,0.7)",
              paintOrder: "stroke fill",
            }}
          >
            {outroLine}
          </p>
          {outcome === "victory" &&
            (() => {
              const rewards = effectiveRewards();
              const items = rewards.victoryItems ?? [];
              if (items.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-sm text-paper/80">Gained:</span>
                  {items.map((it) => (
                    <span
                      key={it}
                      className="rounded-pill bg-paper/90 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-soft"
                    >
                      {prettyItem(it)}
                    </span>
                  ))}
                </div>
              );
            })()}
          <button
            type="button"
            onClick={finishOutro}
            className="inline-flex min-h-14 items-center justify-center rounded-pill bg-accent-deep px-9 text-lg font-semibold text-paper shadow-button transition-all hover:-translate-y-0.5 hover:shadow-button-hover active:scale-[0.98]"
          >
            Continue your journey
          </button>
        </div>
      </>
    );
  }

  // Single outer wrapper — fades in/out as one piece. AnimatePresence in
  // StoryPlayer triggers the exit fade when this component unmounts (e.g.
  // entering or leaving a battle).
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2.4, ease: "easeInOut" }}
      className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden bg-ink"
    >
      {body}
    </motion.div>
  );
}

