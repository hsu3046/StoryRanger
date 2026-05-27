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
  | "wizard";

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
  /** Optional medal earned by this choice. */
  medalTrigger?: string | null;
  /** Optional companion gained (added to party). */
  addsCompanion?: CompanionId;
  /** Optional BGM override for this transition. */
  bgmOverride?: string;
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
  /** If true, free typing input is offered alongside choices. */
  allowFreeInput?: boolean;
  /** Hint text inside the free input box (e.g. "What does Dorothy do?"). */
  freeInputHint?: string;
  /** Optional tag for ending scenes (used for medal triggers + UI). */
  ending?: {
    id: string;
    label: string;
  };
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
  | { type: "free_input_count"; min: number }
  | { type: "ending"; endingId: string }
  /** Awarded directly via an encounter's `rewards.medalId`. Never auto-fires
   *  through `checkNewMedals` — the encounter result pushes the id itself. */
  | { type: "encounter"; encounterId: string };

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
 * Persisted play state — single slot per story in localStorage.
 */
export interface PlayState {
  storyId: string;
  hero: Hero;
  currentSceneId: string;
  earnedMedals: string[];
  companions: CompanionId[];
  freeInputCount: number;
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
  /** ISO timestamp of last update. */
  updatedAt: string;
}

/**
 * LLM JSON response shape for /api/narrate.
 */
export interface NarrateResponse {
  narration: string;
  speaker: SpeakerId;
  nextSceneId: string;
  medalTrigger: string | null;
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
  /** -3..+3 — how this turn shifts the character's mood toward the hero. */
  moodDelta: number;
  /** If the character chooses to share a gameplay hint. */
  hiddenHint: string | null;
  /** If the character gifts an item (id only). */
  itemGift: string | null;
  /** Set true when the character is wrapping up the conversation. */
  endsConversation: boolean;
}

/**
 * Request payload sent to /api/narrate.
 */
export interface NarrateRequest {
  storyId: string;
  sceneId: string;
  freeInput: string;
  /** The hero playing — name + gender drive pronouns in the LLM response. */
  hero: Hero;
  /** Currently available branch candidates (LLM must pick one's `next`). */
  branchCandidates: Array<{ id: string; label: string; next: string }>;
  /** Companions following the player (for continuity in narration). */
  companions: CompanionId[];
}
