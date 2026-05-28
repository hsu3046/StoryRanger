/**
 * Core types for the StoryRanger interactive storybook engine.
 *
 * The story is a directed graph of Scenes connected by Branches.
 * LLM responses to free input are typed as NarrateResponse.
 */

export type SpeakerId =
  | "narrator"
  | "dorothy"
  | "scarecrow"
  | "tinman"
  | "lion"
  | "wicked-witch"
  | "glinda"
  | "wizard"
  | "aunt-em"
  | "toto";

export type CompanionId = "scarecrow" | "tinman" | "lion";

export type AttackerId = "hero" | CompanionId;

export type HeroGender = "girl" | "boy";

export interface Hero {
  name: string;
  gender: HeroGender;
}

export interface Branch {
  /** Stable identifier (used in save state & analytics). */
  id: string;
  /** Player-facing label shown on the choice button. */
  label: string;
  /** Next scene to transition to when picked. */
  next: string;
  /** Optional companion gained (added to party). */
  addsCompanion?: CompanionId;
  /** Optional BGM override for this transition. */
  bgmOverride?: string;
  /** Optional mini-puzzle. Narrative challenge only — actual rewards
   *  belong to the next scene's `reward`. */
  puzzle?: {
    kind: "sequence";
    title: string;
    symbols: string[];
    sequence: number[];
  };
  /** What to do when the puzzle fails. */
  onFailMode?: "retry" | "skip";
  /** Narration shown after the branch resolves, before scene transition. */
  outcome?: string;
}

export interface Scene {
  /** Background illustration (path under /public). */
  image: string;
  /** BGM key (matches a file in /public/audio/bgm). */
  bgm: string;
  /** Who is speaking (drives speech color + TTS voice). */
  speaker: SpeakerId;
  /** Default narration shown when entering this scene. */
  narration: string;
  /** Available choices. Empty array means terminal scene (ending). */
  branches: Branch[];
  /** Optional tag for ending scenes (used for medal triggers + UI). */
  ending?: {
    id: string;
    label: string;
  };
  /** One-shot reward granted on first entry. */
  reward?: {
    items?: string[];
    medalId?: string;
    moodBoost?: { companionId: CompanionId; delta: number }[];
  };
  /** Extra dialogue-able characters present in this scene (added to
   *  the dialogue rail on top of party companions + the scene speaker). */
  dialogueCharacters?: SpeakerId[];
}

export interface Story {
  id: string;
  title: string;
  language: string;
  ageRange: [number, number];
  estimatedMinutes: number;
  coverImage: string;
  startScene: string;
  scenes: Record<string, Scene>;
}

/**
 * Medal trigger types.
 *
 * - "branch": fires when a specific branch.id is taken.
 * - "scene": fires when a specific scene is entered.
 * - "free_input_count": fires after N free-input submissions.
 * - "ending": fires when an ending scene is reached.
 */
export type MedalTrigger =
  | { type: "branch"; branchId: string }
  | { type: "scene"; sceneId: string }
  | { type: "ending"; endingId: string }
  /** Awarded directly via an encounter's `rewards.medalId`. Never auto-fires
   *  through `checkNewMedals` — the encounter result pushes the id itself. */
  | { type: "encounter"; encounterId: string }
  /** Awarded after N companion dialogues completed (replaces free_input). */
  | { type: "dialogue_count"; min: number };

export interface Medal {
  id: string;
  name: string;
  /** Emoji or path to SVG/PNG icon under /public/medals. */
  icon: string;
  description: string;
  trigger: MedalTrigger;
}

export interface MedalsFile {
  medals: Medal[];
}

export interface Character {
  id: SpeakerId;
  name: string;
  /** OpenAI tts-1 voice id. */
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  /** TTS playback speed (0.25–4.0). Mapped to OpenAI's `speed` param. */
  voiceSpeed: number;
  /** Hex color for the speech box label. */
  color: string;
  /** Stage display size — feeds the SpriteLayer height the same way
   *  monsters do. */
  size: "tiny" | "small" | "medium" | "large" | "huge";
}

export interface CharactersFile {
  characters: Character[];
}

export interface DialogueMessage {
  role: "hero" | "character";
  text: string;
}

export type CompanionMoods = Partial<Record<CompanionId, number>>;

/**
 * Persistent HP tracked per attacker. Carries across battles so a
 * companion that lost hearts in one fight stays wounded for the next.
 */
export type PartyHp = Partial<Record<AttackerId, number>>;

/**
 * Active overlay between or during scenes. Persisted alongside PlayState
 * so a page refresh resumes on the exact same overlay (puzzle, outcome,
 * encounter) rather than skipping past it.
 *
 *  - "puzzle"   — branch picked, puzzle gating open. Engine state still
 *                 at sourceSceneId. branch.puzzle re-derived from catalog.
 *  - "outcome"  — branch resolved, engine state at destination already.
 *                 items/medalId is a SNAPSHOT for chip display only — the
 *                 actual grant was applied to inventory/medals at takeBranch
 *                 time, so we don't re-apply on hydration.
 *  - "encounter"— battle queue. `queue[0]` is the active battle; `battle`
 *                 carries the live BattleState (HP, phase, round, etc.) so
 *                 a refresh resumes mid-fight. `battle` is undefined while
 *                 the EncounterFlow alert splash plays (it'll re-create on
 *                 mount).
 */
export type InteractionState =
  | {
      kind: "puzzle";
      sourceSceneId: string;
      branchId: string;
      attemptKey: number;
    }
  | {
      kind: "outcome";
      sourceSceneId: string;
      branchId: string;
      items: string[];
      medalId?: string;
    }
  | {
      kind: "encounter";
      /** Remaining encounter ids; index 0 is the active one. */
      queue: string[];
      /** Persisted battle state — undefined during the alert splash.
       *  Typed as `unknown` here to avoid a types↔lib circular import on
       *  BattleState; consumers in `@/components/battle` cast at the boundary. */
      battle?: unknown;
    };

/**
 * Persisted play state — single slot per story in localStorage.
 */
export interface PlayState {
  storyId: string;
  hero: Hero;
  currentSceneId: string;
  earnedMedals: string[];
  companions: CompanionId[];
  /** Completed companion dialogue sessions — drives the dialogue_count
   *  medal. Increments once per dialogue close (not per turn). */
  dialogueCount: number;
  /** Branch ids taken so far, for "the Lion remembers you helped" continuity. */
  branchHistory: string[];
  /** v2.0 — companion friendship 0..10 (default 5 on join). */
  companionMoods?: CompanionMoods;
  /** v2.0 — recent dialogue turns per companion (sliding window of last ~6). */
  dialogueHistory?: Partial<Record<SpeakerId, DialogueMessage[]>>;
  /** v2.0 — items earned through dialogue, encounters, etc. */
  inventory?: string[];
  /** Cumulative HP per attacker. Carries from one battle to the next.
   *  Missing key → use the default max for that attacker. */
  partyHp?: PartyHp;
  /** Max HP per attacker — defaults applied on first play. */
  partyMaxHp?: PartyHp;
  /** Attackers whose HP hit 0 across the run. Cannot rejoin battles. */
  fallenAttackers?: AttackerId[];
  /** v2.0 — encounters already completed (for `once` trigger gating). */
  completedEncounters?: string[];
  /** Scenes whose `reward` was already auto-granted on first entry —
   *  prevents double-grant on revisit. */
  completedSceneRewards?: string[];
  /** Active overlay state (puzzle / outcome / encounter). Persisted so a
   *  refresh resumes on the exact same overlay rather than skipping past. */
  interaction?: InteractionState;
  /** ISO timestamp of last update. */
  updatedAt: string;
}

/**
 * v2.0 — Character dialogue.
 */
export interface DialogueRequest {
  storyId: string;
  characterId: SpeakerId;
  hero: Hero;
  sceneId: string;
  sceneNarration: string;
  companions: CompanionId[];
  /** Current mood of THIS character toward the hero (0..10). */
  currentMood: number;
  /** Sliding-window of last ~6 turns of this dialogue (oldest first). */
  history: DialogueMessage[];
  utterance: string;
}

export interface DialogueResponse {
  reply: string;
  /** Optional one-line action / body language note shown above the reply
   *  ("leans against the tree, sighing"). */
  action?: string | null;
  /** -3..+3 — how this turn shifts the character's mood toward the hero. */
  moodDelta: number;
  /** If the character chooses to share a gameplay hint. */
  hiddenHint: string | null;
  /** If the character gifts an item (id only). */
  itemGift: string | null;
  /** Set true when the character is wrapping up the conversation. */
  endsConversation: boolean;
  /** Up to 3 short suggested next-replies for the hero (~3-8 words each). */
  suggestions: string[];
}

