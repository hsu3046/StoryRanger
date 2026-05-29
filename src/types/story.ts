/**
 * Core types for the StoryRanger interactive storybook engine.
 *
 * The story is a directed graph of Scenes connected by Branches.
 * LLM responses to free input are typed as NarrateResponse.
 */

/**
 * Speaker ids are OPEN — the bundled Wizard of Oz ids below are kept for
 * autocomplete + documentation, but any non-empty string is valid so new
 * stories can introduce their own characters. The `(string & {})` member
 * widens the union to all strings while preserving literal suggestions.
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
  | "toto"
  | (string & {});

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
  /** Authored "ask" questions surfaced as secondary chips in the choice
   *  area. Tapping one opens a seeded in-character conversation with the
   *  named character (who MUST have a persona) — for educational / story
   *  context before choosing a branch. Independent of `speaker`/the rail. */
  asks?: { id: string; label: string; characterId: SpeakerId }[];
}

export interface Story {
  id: string;
  title: string;
  /** Optional tagline displayed under the title on the home carousel. */
  subtitle?: string;
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
  | { type: "branch"; storyId: string; branchId: string }
  | { type: "scene"; storyId: string; sceneId: string }
  | { type: "ending"; storyId: string; endingId: string }
  /** Awarded directly via an encounter's `rewards.medalId`. Never auto-fires
   *  through `checkNewMedals` — the encounter result pushes the id itself. */
  | { type: "encounter"; storyId: string; encounterId: string }
  /** Awarded after N companion dialogues completed (replaces free_input).
   *  Story-agnostic — no storyId, fires in any story. */
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

/** Editable dialogue persona for the interactive character-chat feature.
 *  Mirrors `CharacterPersonaSchema` in data/schemas/character.ts. */
export interface CharacterPersona {
  shortBio: string;
  speechStyle: string;
  voiceTraits: string;
  dos: string[];
  donts: string[];
  giftableItems: string[];
}

export interface Character {
  id: SpeakerId;
  name: string;
  /** The story's protagonist. Player names them in-game (so `name` is just a
   *  default/fallback), no dialogue persona, sprite at `characters/hero.*`.
   *  At most one per story. */
  isHero?: boolean;
  /** OpenAI tts-1 voice id. */
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  /** TTS playback speed (0.25–4.0). Mapped to OpenAI's `speed` param. */
  voiceSpeed: number;
  /** Hex color for the speech box label. */
  color: string;
  /** Stage display size — feeds the SpriteLayer height the same way
   *  monsters do. */
  size: "tiny" | "small" | "medium" | "large" | "huge";
  /** Optional override of the in-scene sprite path (extensionless base).
   *  Omit to use the id-based convention. */
  image?: string;
  /** Optional interactive-dialogue persona (companions + story NPCs).
   *  Omitted for narrator / hero. */
  persona?: CharacterPersona;
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
  /** Characters who have already gifted the hero a keepsake. Each
   *  dialogue character may gift at most ONCE per playthrough — once their
   *  id is here, the dialogue route refuses further gifts from them. */
  giftedCharacters?: SpeakerId[];
  /** Cross-character memory of things the HERO (the player) has said in
   *  conversations — what they told characters, their answers, etc. Global
   *  (not per-character) so any character can stay aware of the hero.
   *  Capped, deterministic (no LLM). MVP-local; intended to migrate to a
   *  server store (e.g. Supabase) later. */
  heroMemory?: string[];
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
  /** Sliding-window of the last several turns of this dialogue (oldest first). */
  history: DialogueMessage[];
  utterance: string;
  /** Things the hero has shared across all conversations (global memory). */
  heroMemory?: string[];
  /** Deterministic one-line "adventures so far" summary (medals, items,
   *  encounters cleared) for ambient situational awareness. */
  journeyNote?: string;
}

export interface DialogueResponse {
  reply: string;
  /** Optional one-line action / body language note shown above the reply
   *  ("leans against the tree, sighing"). */
  action?: string | null;
  /** -3..+3 — how this turn shifts the character's mood toward the hero. */
  moodDelta: number;
  /** If the character gifts an item (id only). Hard-gated server-side:
   *  only honoured at high mood, once per character, whitelisted + real. */
  itemGift: string | null;
  /** Set true when the character is wrapping up the conversation. */
  endsConversation: boolean;
  /** 2 short suggested next-replies for the hero (~3-8 words each). Story
   *  branches are surfaced separately by the client. */
  suggestions: string[];
}

