import type { CompanionId } from "./story";

/**
 * Side encounter definition — a self-contained mini-adventure that
 * triggers between main scenes. v2.0d.
 */

export interface EncounterTrigger {
  /** Main scene that, when ENTERED, may roll this encounter. */
  afterScene: string;
  /** 0..1 probability of triggering. */
  chance: number;
  /** Optional gating requirements. */
  requires?: {
    companion?: CompanionId;
    item?: string;
  };
  /** If true, plays only once per save. */
  once?: boolean;
}

export interface EncounterIntro {
  bg: string;
  narration: string;
}

export interface EncounterRewards {
  victoryItems?: string[];
  medalId?: string;
  moodBoost?: { companionId: CompanionId; delta: number }[];
}

export interface EncounterOutro {
  victory: string;
  defeat?: string;
  escape?: string;
}

/**
 * A small pattern-matching mini-puzzle attached to a story choice. The
 * player watches a sequence of symbols light up, then taps them back in
 * the same order. Light, non-mathy — meant as a moment of agency, not a
 * test.
 */
export interface PatternPuzzleDef {
  kind: "sequence";
  /** Header shown above the puzzle — in-world framing. */
  title: string;
  /** Emoji buttons (3 or 4). */
  symbols: string[];
  /** Order to flash, expressed as indices into `symbols`. */
  sequence: number[];
}

export interface StoryChoiceFailure {
  outroNarration: string;
  rewards?: EncounterRewards;
}

export interface StoryChoice {
  id: string;
  /** Button label shown in the intro. */
  label: string;
  /** Outro shown after picking this choice (on success if puzzle). */
  outroNarration: string;
  /** Per-choice rewards. Falls back to encounter-level rewards if absent. */
  rewards?: EncounterRewards;
  /** Optional gating — picking choice is locked unless requirements met. */
  requires?: {
    companion?: CompanionId;
    item?: string;
  };
  /** Optional light pattern puzzle. Reward granted on success;
   *  `onFail` outro/rewards used on failure. */
  puzzle?: PatternPuzzleDef;
  /** Used only when `puzzle` is set — what happens on a wrong tap. */
  onFail?: StoryChoiceFailure;
}

export type EncounterKind =
  | { kind: "battle"; monsterIds: string[] }
  | {
      kind: "story";
      /** If absent and no `choices`, the encounter auto-resolves to victory. */
      outcome?: "auto-victory";
      /** 2–3 player choices. When set, choice UI replaces the Approach button. */
      choices?: StoryChoice[];
    };

export interface EncounterDef {
  id: string;
  title: string;
  trigger: EncounterTrigger;
  intro: EncounterIntro;
  body: EncounterKind;
  rewards: EncounterRewards;
  outro: EncounterOutro;
  /** Optional monster sprites to show in intro/outro even for story (non-battle) encounters. */
  displayMonsters?: string[];
  /** Boss-style encounters that resolve a main-plot beat — override the
   *  main scene the player moves to next based on outcome. */
  nextSceneOnVictory?: string;
  nextSceneOnDefeat?: string;
}
