"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  Branch,
  CharactersFile,
  CompanionId,
  DialogueResponse,
  InteractionState,
  Medal,
  MedalsFile,
  PlayState,
  Scene,
  SpeakerId,
  Story,
} from "@/types/story";
import type { BattleState } from "@/lib/battle-engine";
import {
  DEFAULT_MAX_HP,
  isTerminalScene,
  newPlayState,
  takeBranch,
} from "@/lib/story-engine";
import { checkMedals } from "@/lib/medals-engine";
import { assetUrl } from "@/lib/asset-paths";
import { ChallengeGate } from "../challenge/ChallengeGate";
import { loadState, saveState, clearState } from "@/lib/storage";
import { recordEarnedAchievements } from "@/lib/achievements";
import {
  characterAssetSlug,
  characterSpriteBase,
  formatNarration,
  resolveHeroId,
} from "@/lib/narrative";
import { getAudio, SFX } from "@/lib/audio-engine";
import { prefetchNarration } from "@/lib/tts-prefetch";

import { Backpack, GearSix, MapTrifold } from "@phosphor-icons/react";

import { SceneImage } from "./SceneImage";
import { CharacterSpeechBox } from "./CharacterSpeechBox";
import { ChoiceButton, choiceButtonClass } from "./ChoiceButton";
import { SettingsModal } from "./SettingsModal";
import { MedalToast } from "../medals/MedalToast";
import { ItemToast } from "./ItemToast";
import { MedalShelfModal } from "../medals/MedalShelfModal";
import { SpeechAudio } from "../audio/SpeechAudio";
import { SceneDialogueLayer } from "../dialogue/SceneDialogueLayer";
import { EncounterFlow, type EncounterResult } from "../encounter/EncounterFlow";
import { canTalkTo, trimDialogueHistory } from "@/lib/dialogue-personas";
import { buildEncounterQueue } from "@/lib/encounter-engine";
import { getEncounter } from "@/data/encounters";
import { prettyItem } from "@/data/items";
import { isBranchVisible } from "@/lib/branch-conditions";
import { generateChallenge, type Challenge } from "@/lib/education";
import { recordWrong } from "@/lib/review-store";
import type { EncounterDef } from "@/types/encounter";

/** Upper bound on the global hero-memory log kept in PlayState. */
const HERO_MEMORY_CAP = 30;

/** Default channel volumes (0–1). Music sits low under the narration; the
 *  Settings "Reset" button restores these. */
const DEFAULT_VOLUMES = { voice: 1, bgm: 0.18, sfx: 0.7 } as const;

/** Stable empty default for `bgmKeys` so the BGM effect doesn't re-run every
 *  render when the prop is omitted (e.g. the admin scene preview). */
const EMPTY_BGM_KEYS: string[] = [];

/**
 * Resolve a character image base path. The hero (speakerId "dorothy")
 * lives in `hero.{ext}` because the file represents a generic protagonist
 * — every other character matches its id 1:1.
 *
 * `mode: "battle"` swaps in the combat-stance art under /battle/.
 */
function characterImagePath(
  storyId: string,
  id: SpeakerId | CompanionId,
  heroId: SpeakerId,
  mode: "default" | "battle" = "default",
): string {
  const filename = characterAssetSlug(id, heroId);
  const folder = mode === "battle" ? "characters/battle" : "characters";
  return `/stories/${storyId}/${folder}/${filename}`;
}

/**
 * Dialogue portrait path — 1024×1024 head-shots used in the rail.
 * Lives in a dedicated `/dialogue/` folder so the artist can paint these
 * with a different framing than the in-scene sprites. Dorothy maps to
 * `hero` to stay consistent with the rest of the asset tree.
 */
function dialoguePortraitPath(
  storyId: string,
  id: SpeakerId | CompanionId,
  heroId: SpeakerId,
): string {
  return `/stories/${storyId}/dialogue/${characterAssetSlug(id, heroId)}`;
}

interface Props {
  story: Story;
  medals: MedalsFile;
  characters: CharactersFile;
  /** localStorage slot for persistence. Defaults to "play" (live game). */
  slot?: string;
  /** When true, any encounter that mounts auto-resolves as a victory with
   *  zero damage / zero rewards. */
  skipBattles?: boolean;
  /** Fires on every PlayState mutation. */
  onStateChange?: (state: PlayState) => void;
  /** Optional React node rendered as a floating bar above the scene. */
  extraTopBar?: React.ReactNode;
  /** When set, ignore any saved state in `slot` and start a fresh
   *  PlayState at this scene. State is NOT persisted in this mode —
   *  intended for the admin per-scene preview modal. */
  initialSceneId?: string;
  /** Admin branch preview — a branch id on `initialSceneId`. When set, the
   *  preview auto-takes that branch on mount, so it starts RIGHT AFTER the
   *  choice (its outcome / encounter / challenge → next scene) instead of on
   *  the source scene's choice list. */
  initialBranchId?: string;
  /** BGM track keys that actually exist for this story (scanned server-side).
   *  Gates the encounter crossfade — we only switch to `battle` / `puzzle`
   *  when the file is present, else the scene BGM keeps playing. */
  bgmKeys?: string[];
  /** BGM keys in the SHARED/common pool (`public/audio/bgm`). A story can use
   *  these too; story keys override same-named common keys. */
  commonBgmKeys?: string[];
  /** Resolved public path of the story's map image (server-scanned), or null
   *  when the story has no `map/` image. When set, an in-game map button is
   *  shown that opens the image full-screen. */
  mapImage?: string | null;
}

export function StoryPlayer({
  story,
  medals,
  characters,
  slot = "play",
  skipBattles,
  onStateChange,
  extraTopBar,
  initialSceneId,
  initialBranchId,
  bgmKeys = EMPTY_BGM_KEYS,
  commonBgmKeys = EMPTY_BGM_KEYS,
  mapImage,
}: Props) {
  const previewMode = !!initialSceneId;
  const [state, setState] = useState<PlayState>(() => {
    const fresh = newPlayState(story);
    if (initialSceneId && story.scenes[initialSceneId]) {
      return { ...fresh, currentSceneId: initialSceneId };
    }
    return fresh;
  });
  const [medalQueue, setMedalQueue] = useState<Medal[]>([]);
  // Items received on the most recent scene entry — shown as a toast (below
  // the medal toast) once the destination scene is reached.
  const [itemToast, setItemToast] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // Per-channel volumes (0–1) — adjusted by the Settings sliders. Voice is the
  // narration TTS, music is BGM, effects are SFX. Seeded from the historic mix
  // defaults (BGM sits low under the voice); hydrated from localStorage below.
  const [voiceVolume, setVoiceVolume] = useState<number>(DEFAULT_VOLUMES.voice);
  const [bgmVolume, setBgmVolume] = useState<number>(DEFAULT_VOLUMES.bgm);
  const [sfxVolume, setSfxVolume] = useState<number>(DEFAULT_VOLUMES.sfx);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Map viewer open (only reachable when `mapImage` is set). */
  const [mapOpen, setMapOpen] = useState(false);
  /** True while a SceneDialogueLayer bubble is open — hides the
   *  underlying narration + branch UI to avoid visual overlap. */
  const [dialogueActive, setDialogueActive] = useState(false);
  /** Seeded-conversation request from an ask chip → SceneDialogueLayer. */
  const [askRequest, setAskRequest] = useState<{
    characterId: SpeakerId;
    question: string;
    key: number;
    /** Optional branch-unlock carried from the tapped ask. */
    unlock?: { keyword: string; goal: string };
  } | null>(null);
  /** Gates the choice-button entrance animation. Flips true when the
   *  narration typewriter finishes (or user taps to skip), and resets
   *  whenever the displayed narration changes (new scene / outcome). */
  const [narrationDone, setNarrationDone] = useState(false);
  // All overlay state (puzzle / outcome / encounter+battle) now lives in
  // `state.interaction` so a page refresh resumes on the exact same
  // overlay rather than skipping past. Helpers below re-derive the rich
  // view-model (Branch, EncounterDef, Medal) from catalogs on demand.
  function setInteraction(next: InteractionState | undefined) {
    setState((s) => ({
      ...s,
      interaction: next,
      updatedAt: new Date().toISOString(),
    }));
  }

  const pendingChallenge = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "challenge") return null;
    const branch = story.scenes[i.sourceSceneId]?.branches.find(
      (b) => b.id === i.branchId,
    );
    if (!branch?.challenge?.enabled) return null;
    // A fresh problem per attempt AND per solved-step (the memo re-runs when
    // `interaction` changes — attemptKey on retry, solved on advance). Difficulty
    // = the player's age tier. `count` is how many must be solved to pass the gate.
    const challenge = generateChallenge({
      age: state.hero.age,
      category: branch.challenge.category,
    });
    const total = Math.max(1, branch.challenge.count ?? 1);
    return { branch, challenge, attemptKey: i.attemptKey, solved: i.solved, total };
  }, [state.interaction, story.scenes, state.hero.age]);

  const pendingOutcome = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "outcome") return null;
    const branch = story.scenes[i.sourceSceneId]?.branches.find(
      (b) => b.id === i.branchId,
    );
    if (!branch?.outcome) return null;
    return {
      branch,
      sourceSceneId: i.sourceSceneId,
      text: branch.outcome,
    };
  }, [state.interaction, story.scenes]);

  const pendingEncounter: EncounterDef | null = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "encounter") return null;
    const headId = i.queue[0];
    return headId ? getEncounter(headId) : null;
  }, [state.interaction]);

  // Length of the remaining encounter queue. A `count: N` encounter expands to
  // N identical ids, so the id alone can't distinguish occurrence 1 from 2.
  // The queue strictly shrinks per battle (applyEncounterResult slices it), so
  // this length gives each occurrence a distinct identity for remount keys +
  // effect deps — without it, consecutive same-id battles reuse the frozen
  // EncounterFlow/BattleScreen instance (battle 2 shows battle 1's victory).
  const encounterQueueLen =
    state.interaction?.kind === "encounter"
      ? state.interaction.queue.length
      : 0;

  // Bumped when an encounter ends, so the scene background re-mounts and
  // zoom-reveals — the world "returns" after a battle rather than just popping
  // back. Normal scene-to-scene changes leave this untouched (they keep the
  // painterly cross-fade instead).
  const [sceneRevealKey, setSceneRevealKey] = useState(0);
  // Bumped by "Try again" after a defeat — part of the EncounterFlow key so the
  // battle re-mounts fresh.
  const [encounterRetryNonce, setEncounterRetryNonce] = useState(0);
  const prevEncounterActiveRef = useRef(false);
  useEffect(() => {
    const active = !!pendingEncounter;
    if (prevEncounterActiveRef.current && !active) {
      setSceneRevealKey((k) => k + 1);
    }
    prevEncounterActiveRef.current = active;
  }, [pendingEncounter]);

  // Deterministic "adventures so far" line for ambient dialogue awareness.
  // No LLM — derived from already-tracked structured state.
  const journeyNote = useMemo(() => {
    const parts: string[] = [];
    const medalNames = state.earnedMedals
      .map((id) => medals.medals.find((m) => m.id === id)?.name)
      .filter((n): n is string => !!n);
    if (medalNames.length) parts.push(`medals earned: ${medalNames.join(", ")}`);
    const items = Array.from(new Set(state.inventory ?? [])).map((id) =>
      prettyItem(id),
    );
    if (items.length) parts.push(`carrying: ${items.join(", ")}`);
    const cleared = (state.completedEncounters ?? []).length;
    if (cleared) parts.push(`${cleared} encounter(s) cleared`);
    return parts.join("; ");
  }, [
    state.earnedMedals,
    state.inventory,
    state.completedEncounters,
    medals.medals,
  ]);

  const persistedBattleState: BattleState | undefined = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "encounter") return undefined;
    return i.battle as BattleState | undefined;
  }, [state.interaction]);
  const router = useRouter();

  function handleApplyDialogueTurn(
    targetId: SpeakerId,
    resp: DialogueResponse,
    userText: string,
  ) {
    setState((prev) => {
      const currentMood = prev.companionMoods?.[targetId as CompanionId] ?? 5;
      const nextMood = Math.max(
        0,
        Math.min(10, currentMood + (resp.moodDelta ?? 0)),
      );

      // First-turn greeting has empty heroText — don't push that empty
      // hero turn into history, only the character's opener.
      const baseHistory = prev.dialogueHistory?.[targetId] ?? [];
      const turns = userText
        ? [
            ...baseHistory,
            { role: "hero" as const, text: userText },
            { role: "character" as const, text: resp.reply },
          ]
        : [...baseHistory, { role: "character" as const, text: resp.reply }];
      const trimmed = trimDialogueHistory(turns, 12);

      // itemGift is already hard-gated server-side (mood, once-per-character,
      // whitelist, catalogue). When one arrives, bank it AND record the
      // character as having gifted so future turns send alreadyGifted=true.
      const inventory = resp.itemGift
        ? [...(prev.inventory ?? []), resp.itemGift]
        : prev.inventory;
      const giftedCharacters = resp.itemGift
        ? Array.from(new Set([...(prev.giftedCharacters ?? []), targetId]))
        : prev.giftedCharacters;

      // Record what the hero said into the global cross-character memory.
      // Skip the first-turn opener (empty userText) and consecutive dupes;
      // cap to the most recent HERO_MEMORY_CAP lines.
      const trimmedUser = userText.trim();
      const prevMemory = prev.heroMemory ?? [];
      const heroMemory =
        trimmedUser && prevMemory[prevMemory.length - 1] !== trimmedUser
          ? [...prevMemory, trimmedUser].slice(-HERO_MEMORY_CAP)
          : prevMemory;

      return {
        ...prev,
        companionMoods: {
          ...(prev.companionMoods ?? {}),
          [targetId as CompanionId]: nextMood,
        },
        dialogueHistory: {
          ...(prev.dialogueHistory ?? {}),
          [targetId]: trimmed,
        },
        inventory,
        giftedCharacters,
        heroMemory,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /** A seeded-ask conversation judged its goal met → bank the keyword. The
   *  gated branch (condition.hasKeywords) then appears via `visibleBranches`,
   *  which re-derives from `state`. Idempotent — banking a keyword twice is a
   *  no-op. */
  function handleKeywordUnlocked(keyword: string) {
    setState((prev) => {
      if ((prev.unlockedKeywords ?? []).includes(keyword)) return prev;
      // SFX cue only — the previously-hidden gated branch now appearing in the
      // choice row is the visible reward (a text toast would need to surface a
      // raw keyword id, which we deliberately keep hidden from the child).
      getAudio().playSfx(SFX.MEDAL);
      return {
        ...prev,
        unlockedKeywords: [...(prev.unlockedKeywords ?? []), keyword],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function handleDialogueClose() {
    setState((prev) => {
      const nextState: PlayState = {
        ...prev,
        dialogueCount: prev.dialogueCount + 1,
        updatedAt: new Date().toISOString(),
      };
      // Dialogues counter changed → award any metric medals now reached.
      const earned = checkMedals(medals, nextState);
      if (earned.length > 0) {
        setMedalQueue((q) => [...q, ...earned]);
        getAudio().playSfx(SFX.MEDAL);
        return {
          ...nextState,
          earnedMedals: [...nextState.earnedMedals, ...earned.map((m) => m.id)],
        };
      }
      return nextState;
    });
  }

  // One-shot hydration from localStorage. Preview mode skips loading saved
  // state (the parent passed an explicit starting scene); mute preference
  // still applies so the per-scene preview respects the player's choice.
  useEffect(() => {
    if (!previewMode) {
      const saved = loadState(story.id, slot);
      if (saved && story.scenes[saved.currentSceneId]) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
        setState(saved);
      }
    }
    // Restore saved channel volumes; migrate the legacy single mute toggle
    // (which silenced everything) by starting all channels at 0 if it was on.
    const ls = window.localStorage;
    const legacyMuted = ls.getItem("storyranger:muted") === "1";
    const readVol = (key: string, fallback: number) => {
      const n = Number(ls.getItem(key));
      if (Number.isFinite(n) && ls.getItem(key) !== null) {
        return Math.max(0, Math.min(1, n));
      }
      return legacyMuted ? 0 : fallback;
    };
    setVoiceVolume(readVol("storyranger:voiceVolume", DEFAULT_VOLUMES.voice));
    setBgmVolume(readVol("storyranger:bgmVolume", DEFAULT_VOLUMES.bgm));
    setSfxVolume(readVol("storyranger:sfxVolume", DEFAULT_VOLUMES.sfx));
    setHydrated(true);
  }, [story, slot, previewMode]);

  // Persist channel volumes + push BGM/SFX levels to the audio engine. (Voice
  // is applied to narration + dialogue via the SpeechAudio `volume` prop.)
  useEffect(() => {
    if (!hydrated) return;
    const ls = window.localStorage;
    ls.setItem("storyranger:voiceVolume", String(voiceVolume));
    ls.setItem("storyranger:bgmVolume", String(bgmVolume));
    ls.setItem("storyranger:sfxVolume", String(sfxVolume));
    const audio = getAudio();
    audio.setBgmVolume(bgmVolume);
    audio.setSfxVolume(sfxVolume);
  }, [voiceVolume, bgmVolume, sfxVolume, hydrated]);

  // Click SFX — only buttons that opt in via `data-sfx` make a sound (e.g.
  // the free-input send button, the battle item button). A generic
  // every-button click sound proved too noisy, so there's no default cue.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>(
        "button",
      );
      const key = el?.dataset.sfx;
      if (!key || key === "none") return;
      getAudio().playSfx(key);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    // Preview mode is ephemeral — never write to localStorage so closing
    // and re-opening the modal always starts fresh at the chosen scene.
    if (hydrated && !previewMode) saveState(state, slot);
  }, [state, hydrated, slot, previewMode]);

  // Mirror earned medals into the GLOBAL achievement record (cross-story,
  // separate localStorage key). Medals are achievements, not per-story
  // progress — `recordEarnedAchievements` is an idempotent union, so this
  // also seeds the global store from an existing per-story save on mount.
  // Preview mode stays ephemeral.
  useEffect(() => {
    if (hydrated && !previewMode) recordEarnedAchievements(state.earnedMedals);
  }, [state.earnedMedals, hydrated, previewMode]);

  // Surface every state change to the parent (Demo uses this to push undo
  // snapshots). Skip the initial render — only mutations matter.
  useEffect(() => {
    if (hydrated) onStateChange?.(state);
    // We intentionally omit `onStateChange` from deps so an inline arrow
    // from the parent doesn't re-fire this effect on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated]);

  // Drive BGM by the scene the player has actually SETTLED on, not by
  // `state.currentSceneId`. The latter advances to the destination at
  // branch-commit time, but during an outcome bridge or a battle the player
  // hasn't arrived yet — the outgoing scene's art / the battle bg is on screen.
  // Holding BGM until `interaction` clears makes the track change on ARRIVAL at
  // the next scene (A → B), not a beat early on the branch (A → branch(B) → B).
  // Auto-crossfades; stopped only when StoryPlayer unmounts (story exit).
  const audibleSceneIdRef = useRef(state.currentSceneId);
  // A BGM key may live in the story's own folder OR the shared/common pool.
  // Story overrides common: resolve by passing story.id when the story has the
  // file, else undefined (→ audio-engine uses the common `/audio/bgm/<key>`).
  const playResolvedBgm = useCallback(
    (key: string) => {
      const audio = getAudio();
      if (commonBgmKeys.includes(key) && !bgmKeys.includes(key)) {
        audio.playBgm(key); // common-only
      } else {
        audio.playBgm(key, story.id); // story (or default attempt)
      }
    },
    [bgmKeys, commonBgmKeys, story.id],
  );
  // Battle / puzzle BGM variant pools — every file named `battle`, `battle_1`,
  // `battle_2`, … (and likewise `puzzle*`), from EITHER the story or common
  // pool, is an interchangeable variant; one is picked at random per encounter.
  const allBgmKeys = useMemo(
    () => [...new Set([...bgmKeys, ...commonBgmKeys])],
    [bgmKeys, commonBgmKeys],
  );
  const battleBgmVariants = useMemo(
    () => allBgmKeys.filter((k) => k === "battle" || k.startsWith("battle_")),
    [allBgmKeys],
  );
  const puzzleBgmVariants = useMemo(
    () => allBgmKeys.filter((k) => k === "puzzle" || k.startsWith("puzzle_")),
    [allBgmKeys],
  );
  // The variant chosen for the CURRENT interaction — kept stable while it lasts
  // (a re-render mid-battle must not re-roll + restart the track); re-picked
  // only when a new encounter / challenge begins.
  const interactionBgmRef = useRef<{ kind: string; track: string } | null>(null);
  // Track only the interaction KIND, not the whole object — a battle snapshot
  // mutates state.interaction every turn but must not re-evaluate BGM.
  const interactionKind = state.interaction?.kind;
  useEffect(() => {
    if (!interactionKind) {
      // Arrived — the branch transition is over: adopt the destination scene
      // (puzzle keeps currentSceneId at the source anyway; outcome/encounter
      // advance it early, which is why we wait for the overlay to clear).
      audibleSceneIdRef.current = state.currentSceneId;
      interactionBgmRef.current = null;
    }
    // During a battle / challenge, crossfade to a RANDOM matching variant —
    // but ONLY when at least one such file exists, else keep the scene BGM
    // rather than cutting to silence.
    if (interactionKind === "encounter" || interactionKind === "challenge") {
      const pool =
        interactionKind === "encounter" ? battleBgmVariants : puzzleBgmVariants;
      if (pool.length > 0) {
        let cur = interactionBgmRef.current;
        if (!cur || cur.kind !== interactionKind) {
          const track = pool[Math.floor(Math.random() * pool.length)];
          cur = { kind: interactionKind, track };
          interactionBgmRef.current = cur;
        }
        playResolvedBgm(cur.track);
        return;
      }
    }
    // BGM follows the scene the player has settled on (held through any
    // in-flight transition overlay).
    const scene = story.scenes[audibleSceneIdRef.current];
    if (scene) playResolvedBgm(scene.bgm);
  }, [
    story,
    state.currentSceneId,
    interactionKind,
    battleBgmVariants,
    puzzleBgmVariants,
    playResolvedBgm,
  ]);

  useEffect(() => {
    return () => {
      getAudio().stopBgm();
    };
  }, []);

  const currentScene: Scene = story.scenes[state.currentSceneId];
  // Conditional branches (require an item / companion) only appear once their
  // gate is met. Shared by the bottom choice row AND the in-dialogue reply
  // cards so a gated branch can't be taken while chatting either.
  const visibleBranches = useMemo(
    () => (currentScene.branches ?? []).filter((b) => isBranchVisible(b, state)),
    [currentScene, state],
  );
  const heroId = useMemo(() => resolveHeroId(characters), [characters]);
  const characterMap = useMemo(() => {
    const map: Record<string, (typeof characters.characters)[number]> = {};
    for (const c of characters.characters) map[c.id] = c;
    return map;
  }, [characters]);

  // Authored asks whose answering character actually has a persona (defense
  // in depth — a hand-edited scenes.json could name a non-dialogue speaker).
  const visibleAsks = useMemo(
    () =>
      (currentScene.asks ?? []).filter((a) =>
        canTalkTo(characterMap[a.characterId]),
      ),
    [currentScene.asks, characterMap],
  );

  function handleChoose(branch: Branch) {
    // An educational-challenge gate blocks the reward. Stage it on
    // `interaction` — engine state stays on the source scene until the
    // challenge resolves, so a refresh re-mounts the same gate.
    if (branch.challenge?.enabled) {
      setInteraction({
        kind: "challenge",
        sourceSceneId: state.currentSceneId,
        branchId: branch.id,
        attemptKey: 0,
        solved: 0,
      });
      return;
    }
    commitBranch(branch, { skipReward: false });
  }

  // Admin branch preview — auto-take the requested branch ONCE on mount so the
  // preview opens right after the choice (outcome / encounter / challenge →
  // next scene) rather than on the source scene's choice list.
  const autoChoseRef = useRef(false);
  useEffect(() => {
    if (autoChoseRef.current || !initialBranchId || !initialSceneId) return;
    const branch = story.scenes[initialSceneId]?.branches.find(
      (b) => b.id === initialBranchId,
    );
    if (!branch) return;
    autoChoseRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount: replay the chosen branch so the preview opens after the choice
    handleChoose(branch);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount auto-take
  }, []);

  /** Apply the branch transition. `skipReward` lets the caller suppress
   *  reward grant (used when a puzzle fails in `skip` mode).
   *
   *  When the branch defines an `outcome`, we still apply the engine
   *  state immediately (so rewards/medals are realised) but pause UI on
   *  an "outcome page": same scene art, outcome narration, reward chips
   *  inline. Tap anywhere fires `continueFromOutcome()` and the scene
   *  transition proceeds. */
  function commitBranch(branch: Branch, opts: { skipReward: boolean }) {
    // Drop any pending ask so it can't ride an encounter/outcome bridge and
    // auto-open the previous scene's character over the destination scene.
    setAskRequest(null);
    const audio = getAudio();
    // The choice button's click already plays the generic click SFX (global
    // delegated listener below). Here we only add the event-specific cue.
    if (branch.addsCompanions?.length) audio.playSfx(SFX.COMPANION);

    const prevSceneId = state.currentSceneId;

    const result = takeBranch(state, branch, story, medals, opts);
    // Metric medals earned by this transition (choices/friends counters)
    // announce immediately. The entered scene's reward ITEMS are deferred —
    // shown as a toast once the player lands on the destination scene (see the
    // scene-reward arrival effect), never on the bridge page.
    if (result.earnedMedals.length > 0) {
      setMedalQueue((q) => [...q, ...result.earnedMedals]);
      audio.playSfx(SFX.MEDAL);
    }
    // Stage the scene reward's arrival toast IN PlayState (persisted) so a
    // refresh mid-overlay still surfaces it on arrival. The items are already
    // applied to `inventory` by takeBranch; this is only the pending toast.
    const sr = result.sceneReward;
    const pendingRewardToast =
      sr && (sr.items?.length ?? 0) > 0
        ? { sceneId: branch.next, items: sr.items ?? [] }
        : undefined;

    // Outcome path: pause on the outgoing scene art with the branch outcome
    // text only. Rewards are NOT shown here — they surface as toasts on the
    // destination scene.
    if (branch.outcome && !opts.skipReward) {
      setState({
        ...result.state,
        interaction: {
          kind: "outcome",
          sourceSceneId: prevSceneId,
          branchId: branch.id,
        },
        pendingRewardToast,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    // No outcome → immediate transition + build encounter pool.
    const queue = buildEncounterQueue(prevSceneId, branch.id, result.state);
    setState({
      ...result.state,
      interaction:
        queue.length > 0
          ? { kind: "encounter", queue: queue.map((e) => e.id) }
          : undefined,
      pendingRewardToast,
      updatedAt: new Date().toISOString(),
    });
  }

  function continueFromOutcome() {
    if (!pendingOutcome) return;
    // Same guard as commitBranch — the outcome bridge unmounts/remounts the
    // dialogue layer, so a leaked ask would re-open on the destination scene.
    setAskRequest(null);
    const { sourceSceneId, branch } = pendingOutcome;
    // Build the encounter pool for the branch we just traversed and let
    // the regular flow consume it before the destination scene narrates.
    const queue = buildEncounterQueue(sourceSceneId, branch.id, state);
    setInteraction(
      queue.length > 0
        ? { kind: "encounter", queue: queue.map((e) => e.id) }
        : undefined,
    );
  }

  function handleChallengeResolved(correct: boolean) {
    if (!pendingChallenge) return;
    const { branch, solved, total } = pendingChallenge;
    if (correct) {
      // Advance through the gate's `count` problems; commit only after the last.
      if (solved + 1 >= total) {
        setInteraction(undefined);
        commitBranch(branch, { skipReward: false });
        return;
      }
      setState((s) =>
        s.interaction?.kind === "challenge"
          ? {
              ...s,
              interaction: {
                ...s.interaction,
                solved: s.interaction.solved + 1,
                attemptKey: 0,
              },
              updatedAt: new Date().toISOString(),
            }
          : s,
      );
      return;
    }
    // Save the missed question for the home "Check Your Answers" study tool
    // (live play only — never the admin preview or the demo slot). Only the
    // FIRST miss per gate step (attemptKey === 0) is recorded: the gate can't
    // be failed out of and re-rolls a fresh problem on every retry, so without
    // this a stubborn gate would flood the review list with its variations.
    if (!previewMode && slot === "play" && pendingChallenge.attemptKey === 0) {
      recordWrong(
        story.id,
        pendingChallenge.challenge,
        "gate",
        new Date().toISOString(),
      );
    }
    // Wrong answer → always retry until solved: bump attemptKey to re-roll a
    // fresh problem (the gate can't be failed out of).
    setState((s) =>
      s.interaction?.kind === "challenge"
        ? {
            ...s,
            interaction: {
              ...s.interaction,
              attemptKey: s.interaction.attemptKey + 1,
            },
            updatedAt: new Date().toISOString(),
          }
        : s,
    );
  }

  /** Persist live BattleState changes from the active EncounterFlow into
   *  the interaction slice so a refresh resumes mid-fight. */
  function handleBattleStateChange(battle: BattleState) {
    setState((s) => {
      if (s.interaction?.kind !== "encounter") return s;
      return {
        ...s,
        interaction: { ...s.interaction, battle },
        updatedAt: new Date().toISOString(),
      };
    });
  }

  /** "Try again" after a defeat — restart the lost battle from the top with the
   *  party fully restored, keeping the player at the same point in the story.
   *  Bumping the nonce re-mounts EncounterFlow; clearing `battle` re-inits it. */
  function retryEncounter() {
    setState((prev) => {
      if (prev.interaction?.kind !== "encounter") return prev;
      return {
        ...prev,
        partyHp: { ...(prev.partyMaxHp ?? { hero: DEFAULT_MAX_HP.hero }) },
        fallenAttackers: [],
        interaction: { ...prev.interaction, battle: undefined },
      };
    });
    setEncounterRetryNonce((n) => n + 1);
  }

  function applyEncounterResult(res: EncounterResult) {
    // Whole-party defeat → the player picked "Leave the story" on the defeat
    // panel ("Try again" is handled by retryEncounter, never reaching here).
    // Keep their progress: drop the lost battle overlay, restore the party so
    // a later Continue resumes cleanly, save, and return to the title screen.
    if (res.outcome === "defeat") {
      const next: PlayState = {
        ...state,
        interaction: undefined,
        partyHp: { ...(state.partyMaxHp ?? { hero: DEFAULT_MAX_HP.hero }) },
        fallenAttackers: [],
        updatedAt: new Date().toISOString(),
      };
      setState(next);
      if (!previewMode) saveState(next, slot);
      router.push("/");
      return;
    }
    setState((prev) => {
      const completed = Array.from(
        new Set([...(prev.completedEncounters ?? []), res.encounterId]),
      );
      // Remove one occurrence per item spent in battle, then add drops.
      // Keep duplicates — the bag groups by id and shows ×N for counts.
      const afterConsumed = [...(prev.inventory ?? [])];
      for (const id of res.itemsConsumed) {
        const idx = afterConsumed.indexOf(id);
        if (idx !== -1) afterConsumed.splice(idx, 1);
      }
      const inventory = res.itemsGained.length
        ? [...afterConsumed, ...res.itemsGained]
        : afterConsumed;
      const companionMoods = { ...(prev.companionMoods ?? {}) };
      if (res.moodBoost) {
        for (const mb of res.moodBoost) {
          if (!prev.companions.includes(mb.companionId)) continue;
          const cur = companionMoods[mb.companionId] ?? 5;
          companionMoods[mb.companionId] = Math.max(
            0,
            Math.min(10, cur + mb.delta),
          );
        }
      }
      // All encounters are battles now → partyHp always returned.
      const partyHp = res.partyHp;
      const fallenAttackers = res.fallenAttackers.length
        ? Array.from(
            new Set([...(prev.fallenAttackers ?? []), ...res.fallenAttackers]),
          )
        : prev.fallenAttackers;

      // Pop the head of the queue. Reset `battle` so the next battle
      // re-plays its alert splash and starts fresh. Clear interaction
      // entirely when the queue empties. If somehow this fires while
      // interaction is a non-encounter (shouldn't happen, but in case of
      // a transient state race) preserve it rather than nuking unrelated
      // overlay state.
      let nextInteraction: InteractionState | undefined = prev.interaction;
      if (prev.interaction?.kind === "encounter") {
        const nextQueue = prev.interaction.queue.slice(1);
        nextInteraction =
          nextQueue.length > 0
            ? { kind: "encounter", queue: nextQueue }
            : undefined;
      }

      const base: PlayState = {
        ...prev,
        completedEncounters: completed,
        inventory,
        companionMoods,
        partyHp,
        fallenAttackers,
        interaction: nextInteraction,
        updatedAt: new Date().toISOString(),
      };
      // Battles-cleared counter changed → award any metric medals now reached.
      const earned = checkMedals(medals, base);
      if (earned.length > 0) {
        setMedalQueue((q) => [...q, ...earned]);
        getAudio().playSfx(SFX.MEDAL);
        return {
          ...base,
          earnedMedals: [...base.earnedMedals, ...earned.map((m) => m.id)],
        };
      }
      return base;
    });
  }

  function handleReset() {
    clearState(story.id, slot);
    setState(newPlayState(story));
    setMedalQueue([]);
    setItemToast(null);
  }

  // Demo "skip battles" auto-resolve. When a battle would mount and
  // skipBattles is on, fire victory immediately so the storyline walk
  // doesn't stall on combat. We still grant the encounter's medal/mood
  // so the medal flow is exercised end-to-end.
  //
  // Triggering state inside an effect is intentional here — pendingEncounter
  // becomes truthy as a *consequence* of the engine state advancing, so we
  // need to observe it before short-circuiting the battle UI.
  useEffect(() => {
    if (!skipBattles || !pendingEncounter) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional auto-resolve of the just-mounted encounter
    applyEncounterResult({
      encounterId: pendingEncounter.id,
      outcome: "victory",
      partyHp: state.partyHp ?? { hero: DEFAULT_MAX_HP.hero },
      fallenAttackers: [],
      // Demo skip grants the encounter-level drops (monster drops are skipped
      // along with the battle).
      itemsGained: pendingEncounter.rewards.items ?? [],
      itemsConsumed: [],
      moodBoost: pendingEncounter.rewards.moodBoost,
    });
    // Only react to skipBattles toggling or a new pendingEncounter
    // appearing — we don't want every state.partyHp tick to retrigger.
    // `encounterQueueLen` distinguishes occurrences of a same-id `count: N`
    // chain so the auto-resolve re-fires for each queued battle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipBattles, pendingEncounter?.id, encounterQueueLen]);

  const speaker = characterMap[currentScene.speaker];
  // Ending = manually marked (currentScene.ending) AND terminal (no branch
  // leads onward). The terminal gate means a scene that later gains a branch
  // stops being an ending automatically.
  const isEnding =
    !!currentScene.ending && isTerminalScene(currentScene, story.scenes);

  // Warm the TTS cache while the player listens to the current scene.
  // For every branch on the current scene, fire-and-forget prefetches for
  // (a) the branch's outcome line (spoken by the current narrator) and
  // (b) the destination scene's narration (spoken by that scene's speaker).
  // First-time visit to either becomes an IndexedDB cache hit on click,
  // skipping the OpenAI roundtrip that the user perceived as "slow start".
  useEffect(() => {
    if (!hydrated || voiceVolume <= 0) return;
    const currentVoice = speaker?.voice;
    const currentSpeed = speaker?.voiceSpeed ?? 1;
    for (const branch of currentScene.branches ?? []) {
      if (branch.outcome && currentVoice) {
        void prefetchNarration(
          formatNarration(branch.outcome, state.hero),
          currentVoice,
          currentSpeed,
        );
      }
      const nextScene = story.scenes[branch.next];
      if (!nextScene) continue;
      const nextSpeaker = characterMap[nextScene.speaker];
      if (!nextSpeaker) continue;
      void prefetchNarration(
        formatNarration(nextScene.narration, state.hero),
        nextSpeaker.voice,
        nextSpeaker.voiceSpeed,
      );
    }
  }, [
    hydrated,
    voiceVolume,
    currentScene,
    speaker,
    story.scenes,
    characterMap,
    state.hero,
  ]);

  // Outcome page overrides the displayed scene art + narration with the
  // outgoing scene's image + the branch's outcome text. The actual
  // PlayState has already advanced to the next scene; we look the prior
  // scene up by id from interaction (works even on refresh-resume).
  const showingOutcome = !!pendingOutcome;

  // Scene reward arrival — show the item toast only once the player has
  // actually LANDED on the rewarded scene (outcome bridge dismissed, no
  // encounter overlay). Reads from the PERSISTED `pendingRewardToast`, so a
  // refresh mid-overlay still surfaces it here; clearing it (in state) stops it
  // re-firing. (Medals are earned from metrics, not scene rewards.)
  useEffect(() => {
    const r = state.pendingRewardToast;
    if (!r || r.sceneId !== state.currentSceneId) return;
    if (showingOutcome || pendingEncounter) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on arrival; cleared below
    if (r.items.length > 0) setItemToast(r.items);
    setState((s) => ({ ...s, pendingRewardToast: undefined }));
  }, [
    state.pendingRewardToast,
    state.currentSceneId,
    showingOutcome,
    pendingEncounter,
  ]);

  const outcomePrevScene = pendingOutcome
    ? story.scenes[pendingOutcome.sourceSceneId]
    : null;
  const displayedNarration = showingOutcome
    ? formatNarration(pendingOutcome.text, state.hero)
    : formatNarration(currentScene.narration, state.hero);
  const displayedSpeakerId: SpeakerId = showingOutcome
    ? outcomePrevScene?.speaker ?? currentScene.speaker
    : currentScene.speaker;
  const displayedImage = showingOutcome
    ? outcomePrevScene?.image ?? currentScene.image
    : currentScene.image;
  const displayedSceneKey = showingOutcome
    ? `outcome:${pendingOutcome.branch.id}`
    : state.currentSceneId;

  // If the speaker is the hero, swap in the player's chosen name (the hero's
  // catalogued name is only a default).
  const baseSpeaker = characterMap[displayedSpeakerId] ?? speaker;
  const displayedSpeaker =
    displayedSpeakerId === heroId && baseSpeaker
      ? { ...baseSpeaker, name: state.hero.name }
      : baseSpeaker;

  const narrationKey = `${displayedSceneKey}:${displayedNarration.slice(0, 40)}`;

  // Reset the narration-done gate whenever the narration content changes
  // so the next scene's choices re-enter via the typewriter→fade flow.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: narrationKey transition drives the gate reset
    setNarrationDone(false);
  }, [narrationKey]);

  // `fixed inset-0` (instead of `relative h-dvh w-dvw`) pins the player
  // root to the viewport edges directly, independent of any parent
  // context — body padding, flex layout, iOS Safari's implicit
  // `viewport-fit: cover` safe-area injection, scrollbar gutters, etc.
  // The earlier `relative w-dvw` setup left a thin strip of body bg on
  // the LEFT of iPad / desktop Chrome alike, because the player was
  // being placed inside body's content area (which an outer layer was
  // insetting). Fixed positioning sees the viewport directly — no
  // ambiguity, no math, no per-browser quirks.
  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-ink">
      {/* Full-bleed scene image as background — both old & new in DOM at
          the same time so the swap is a true cross-fade. Long duration for
          a slow, painterly transition between storybook pages. */}
      <motion.div
        // Re-mounts (zoom-reveal) on the home "dive" AND whenever a battle
        // ends (`sceneRevealKey` bump) — the world settles back in. Normal
        // scene swaps don't change the key, so they keep the painterly
        // cross-fade from the inner AnimatePresence instead.
        key={`reveal-${sceneRevealKey}`}
        className="absolute inset-0"
        // The scene starts slightly zoomed-in and settles back. Skipped in
        // admin preview.
        initial={previewMode ? false : { scale: 1.12 }}
        animate={{ scale: 1 }}
        transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={`img-${displayedSceneKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <SceneImage src={displayedImage} alt={`${story.title} — scene`} />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Top + bottom gradient veils for UI legibility over the image */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-ink/55 via-ink/15 to-transparent" />

      {/* Top header — floating over the image. Left slot is reserved for
          the demo Previous/Skip/Reset bar (only rendered when the parent
          passes `extraTopBar`); right slot holds the always-on Backpack +
          Settings buttons. */}
      <header
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 sm:gap-3">{extraTopBar}</div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setShelfOpen(true)}
            aria-label="View your treasures"
            className="flex h-11 items-center gap-2 rounded-pill bg-paper/85 px-4 text-base ring-1 ring-ink-soft/10 backdrop-blur transition-colors hover:bg-paper"
          >
            <Backpack size={22} weight="duotone" className="text-accent" />
            <span className="font-semibold text-ink tabular-nums">
              {(state.inventory ?? []).length}
            </span>
          </button>
          {mapImage && (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              aria-label="View the map"
              className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper/85 text-ink-soft ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper hover:text-ink active:scale-90"
            >
              <MapTrifold size={22} weight="duotone" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper/85 text-ink-soft ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper hover:text-ink active:scale-90"
          >
            <GearSix size={22} weight="duotone" />
          </button>
        </div>
      </header>

      {/* Bottom layout — narration (above), choices row (below). Hidden
          while a dialogue bubble is open so the two UIs don't overlap.
          During an outcome page the whole region also acts as a tap
          target → continueFromOutcome(). */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch gap-3 px-4 pb-4 transition-opacity duration-200 sm:px-6 sm:pb-6 sm:gap-4 ${
          dialogueActive ? "pointer-events-none opacity-0" : "opacity-100"
        } ${showingOutcome ? "cursor-pointer" : ""}`}
        aria-hidden={dialogueActive}
        onClick={showingOutcome ? continueFromOutcome : undefined}
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Narration — cinematic subtitle style. Block centered + text
            centered so left/right margins look identical regardless of
            line length. text-balance keeps each line a similar length.
            We gate on `!pendingEncounter` so the Typewriter for the
            destination scene doesn't silently finish behind a battle
            overlay — once the encounter clears the narration mounts
            fresh and types out as the player sees it. */}
        <div className="mx-auto w-[95%] max-w-6xl">
          <AnimatePresence mode="wait">
            {/* Unmounted (not just hidden) while a dialogue is open: if it
                stayed mounted, picking a branch mid-dialogue would change the
                scene and leave the PREVIOUS narration exit-animating just as
                the bottom region fades back in — a one-frame flash of the old
                text. With it unmounted, only the new scene's narration mounts. */}
            {!pendingEncounter && !dialogueActive && (
              <motion.div
                key={`narr-${narrationKey}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                // Fast exit so the OLD narration clears almost instantly on a
                // choice tap (mode="wait" otherwise holds it for the full
                // duration, reading as "the previous text lingers then
                // vanishes"). The new scene's text then types in cleanly.
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.25 }}
                // No fixed height cap — the narration block grows up
                // from the bottom (parent is `absolute bottom-0 flex
                // flex-col`), so longer text simply raises its top Y while
                // the choice row stays anchored at the bottom. A safety
                // ceiling of 60dvh keeps a worst-case multi-paragraph
                // narration from covering the whole scene.
                className="max-h-[60dvh] overflow-y-auto pr-2"
              >
                <CharacterSpeechBox
                  speaker={displayedSpeakerId}
                  characterName={displayedSpeaker?.name ?? "Narrator"}
                  characterColor={displayedSpeaker?.color ?? "#5a4128"}
                  narration={displayedNarration}
                  variant="overlay"
                  onTypingDone={() => setNarrationDone(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Choices row — horizontal at the very bottom. While an outcome
            is pending, we replace the choice row with reward chips + a
            "tap anywhere to continue" hint. */}
        {(() => {
          if (showingOutcome && pendingOutcome) {
            // Outcome bridge shows only the outgoing-scene pause + outcome text.
            // Rewards surface as toasts on the destination scene; metric medals
            // toast separately.
            return (
              <div className="flex flex-col items-center gap-3">
                <span
                  className="text-sm font-semibold uppercase tracking-wide text-paper"
                  style={{
                    textShadow:
                      "0 2px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.95)",
                  }}
                  aria-hidden
                >
                  Tap anywhere to continue
                </span>
              </div>
            );
          }
          if (isEnding) {
            return (
              <EndingPanel
                endingLabel={currentScene.ending?.label ?? ""}
                medalCount={state.earnedMedals.length}
                totalMedals={medals.medals.length}
                onReset={handleReset}
              />
            );
          }

          const branches = visibleBranches;
          // Asks render as additional choices in the SAME left-right row as
          // the branches (not a separate stack above) — to the player an
          // "ask" is just another choice. Hidden during an encounter, matching
          // the rest of the bottom region.
          const askChoices = pendingEncounter ? [] : visibleAsks;
          const choiceCount = askChoices.length + branches.length;
          if (choiceCount === 0) return null;
          // Buttons stay hidden until narration finishes typing, then each
          // pops in with a small stagger. `pointerEvents` is gated too so a
          // rapid tap during the entrance can't accidentally pick a choice.
          const entrance = (i: number) => ({
            initial: { opacity: 0, y: 14, scale: 0.96 },
            animate: narrationDone
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 0, y: 14, scale: 0.96 },
            transition: {
              type: "spring" as const,
              stiffness: 320,
              damping: 26,
              delay: narrationDone ? i * 0.08 : 0,
            },
          });
          // One choice → centered at 2/5 width. Two+ → equal-width columns in
          // a left-right row (already sized for up to 4 via flex-1).
          const tile = (key: string, i: number, node: ReactNode) => (
            <motion.div
              key={key}
              className={choiceCount === 1 ? "w-full sm:w-2/5" : "min-w-0 flex-1"}
              style={{ pointerEvents: narrationDone ? "auto" : "none" }}
              {...entrance(i)}
            >
              {node}
            </motion.div>
          );
          return (
            <div
              className={
                choiceCount === 1
                  ? "flex justify-center"
                  : "flex flex-col items-stretch gap-3 sm:flex-row sm:gap-4"
              }
            >
              {askChoices.map((ask, i) => {
                // Portrait of the character being asked — same source chain as
                // the dialogue portrait (dedicated head-shot → in-scene sprite).
                const ch = characters.characters.find(
                  (c) => c.id === ask.characterId,
                );
                const iconBase =
                  ch?.dialogueImage ??
                  dialoguePortraitPath(story.id, ask.characterId, heroId);
                const iconFallbackBase = ch
                  ? characterSpriteBase(story.id, ch, heroId)
                  : characterImagePath(story.id, ask.characterId, heroId);
                return tile(
                  ask.id,
                  i,
                  <AskChip
                    label={ask.label}
                    iconBase={iconBase}
                    iconFallbackBase={iconFallbackBase}
                    onSelect={() =>
                      setAskRequest({
                        characterId: ask.characterId,
                        question: ask.label,
                        key: Date.now(),
                        unlock: ask.unlock,
                      })
                    }
                  />,
                );
              })}
              {branches.map((branch, i) =>
                tile(
                  branch.id,
                  askChoices.length + i,
                  <ChoiceButton branch={branch} onSelect={handleChoose} />,
                ),
              )}
            </div>
          );
        })()}
      </div>

      {/* Outcome tap-to-continue overlay. Sits BELOW the bottom UI
          (z-10) but ABOVE the scene gradients/image (default z) — tapping
          anywhere outside the speech box advances. */}
      {showingOutcome && (
        <button
          type="button"
          aria-label="Continue"
          onClick={continueFromOutcome}
          className="absolute inset-0 z-[5] cursor-pointer"
        />
      )}

      {hydrated && displayedSpeaker && !pendingEncounter && (
        <SpeechAudio
          text={displayedNarration}
          voiceId={displayedSpeaker.voice}
          voiceSpeed={displayedSpeaker.voiceSpeed}
          volume={voiceVolume}
          playKey={narrationKey}
        />
      )}

      <MedalToast
        medal={medalQueue[0] ?? null}
        onDismiss={() => setMedalQueue((q) => q.slice(1))}
      />
      <ItemToast items={itemToast} onDismiss={() => setItemToast(null)} />

      {/* In-scene dialogue — left-edge portrait rail. Suppressed while
          a battle encounter is active so the rail doesn't sit on top of
          the BattleScreen. Unmounting also resets any open dialogue
          state safely; it remounts after the battle closes. Also hidden
          during the outcome bridge — `currentSceneId` has already advanced to
          the destination, so showing the rail there would surface the NEXT
          scene's characters over the outgoing scene's art. */}
      {!pendingEncounter && !showingOutcome && (
        <SceneDialogueLayer
          // Remount per scene so dialogue session state (active character,
          // bubble, in-flight fetch) can never bleed into the next scene if a
          // future branch path forgets to closeSession().
          key={state.currentSceneId}
          storyId={story.id}
          sceneId={state.currentSceneId}
          sceneSpeaker={currentScene.speaker}
          sceneNarration={displayedNarration}
          hero={state.hero}
          voiceVolume={voiceVolume}
          companions={state.companions}
          extraDialogueCharacters={currentScene.dialogueCharacters ?? []}
          characters={characters}
          // Prefer the `dialogueImage` override, else the /dialogue/<id>
          // convention.
          portraitBase={(id) => {
            const ch = characters.characters.find((c) => c.id === id);
            return (
              ch?.dialogueImage ??
              dialoguePortraitPath(story.id, id as SpeakerId | CompanionId, heroId)
            );
          }}
          // No dedicated dialogue head-shot yet (e.g. a newly added character)
          // → fall back to the in-scene sprite (honors `image`).
          portraitFallbackBase={(id) => {
            const ch = characters.characters.find((c) => c.id === id);
            return ch
              ? characterSpriteBase(story.id, ch, heroId)
              : characterImagePath(story.id, id as SpeakerId, heroId);
          }}
          mood={(id) => state.companionMoods?.[id as CompanionId] ?? 5}
          hasGifted={(id) => (state.giftedCharacters ?? []).includes(id)}
          heroMemory={state.heroMemory ?? []}
          journeyNote={journeyNote}
          branches={visibleBranches}
          onTakeBranch={handleChoose}
          history={(id) => state.dialogueHistory?.[id] ?? []}
          askRequest={askRequest}
          onApplyTurn={handleApplyDialogueTurn}
          onSessionClose={() => handleDialogueClose()}
          onActiveChange={setDialogueActive}
          onAskConsumed={() => setAskRequest(null)}
          onKeywordUnlocked={handleKeywordUnlocked}
        />
      )}

      <MedalShelfModal
        open={shelfOpen}
        catalog={medals}
        earned={state.earnedMedals}
        inventory={state.inventory ?? []}
        onClose={() => setShelfOpen(false)}
      />

      {/* v2.0 — Side encounter overlay. AnimatePresence catches the unmount
          when applyEncounterResult clears pendingEncounter so the overlay's
          exit fade plays. Key by encounter id so a new encounter is treated
          as a fresh mount (re-trigger entry fade). */}
      <AnimatePresence>
        {pendingEncounter && (
          <EncounterFlow
            key={`${pendingEncounter.id}#${encounterQueueLen}#${encounterRetryNonce}`}
            encounter={pendingEncounter}
            storyId={story.id}
            age={state.hero.age}
            recordWrongChallenge={
              !previewMode && slot === "play"
                ? (c: Challenge) =>
                    recordWrong(story.id, c, "battle", new Date().toISOString())
                : undefined
            }
            companions={state.companions}
            companionMoods={state.companionMoods ?? {}}
            partyHp={state.partyHp ?? { hero: DEFAULT_MAX_HP.hero }}
            partyMaxHp={state.partyMaxHp ?? { hero: DEFAULT_MAX_HP.hero }}
            fallenAttackers={state.fallenAttackers ?? []}
            characterImageBase={(id, mode = "default") => {
              // Honor the per-mode override (`image` for the in-scene sprite,
              // `battleImage` for the combat stance); else fall back to the
              // id-based convention for that folder.
              const ch = characters.characters.find((c) => c.id === id);
              if (mode === "default" && ch) {
                return characterSpriteBase(story.id, ch, heroId);
              }
              if (mode === "battle" && ch?.battleImage) {
                return ch.battleImage;
              }
              return characterImagePath(story.id, id, heroId, mode);
            }}
            heroId={heroId}
            characters={characters.characters}
            inventory={state.inventory ?? []}
            initialBattleState={persistedBattleState}
            onBattleStateChange={handleBattleStateChange}
            onComplete={applyEncounterResult}
            onRetry={retryEncounter}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* Branch educational-challenge gate — narrated bookend (intro line →
          problem(s) → outro line) over a dim/blur veil. AnimatePresence plays
          the veil's fade-out when the gate resolves and pendingChallenge clears. */}
      <AnimatePresence>
        {pendingChallenge && (
          <ChallengeGate
            key={pendingChallenge.branch.id}
            challenge={pendingChallenge.challenge}
            solvedCount={pendingChallenge.solved}
            total={pendingChallenge.total}
            attemptKey={pendingChallenge.attemptKey}
            seed={[...pendingChallenge.branch.id].reduce(
              (a, c) => a + c.charCodeAt(0),
              0,
            )}
            onResolved={(correct) => handleChallengeResolved(correct)}
          />
        )}
      </AnimatePresence>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLeave={() => {
          setSettingsOpen(false);
          router.push("/");
        }}
        storyTitle={story.title}
        heroName={state.hero.name}
        voiceVolume={voiceVolume}
        bgmVolume={bgmVolume}
        sfxVolume={sfxVolume}
        onVoiceVolume={setVoiceVolume}
        onBgmVolume={setBgmVolume}
        onSfxVolume={setSfxVolume}
        onResetVolumes={() => {
          setVoiceVolume(DEFAULT_VOLUMES.voice);
          setBgmVolume(DEFAULT_VOLUMES.bgm);
          setSfxVolume(DEFAULT_VOLUMES.sfx);
        }}
        onPreviewSfx={() => getAudio().playSfx(SFX.MEDAL)}
      />

      {/* Map viewer — the story map shown large. Tap the backdrop or ✕ to
          close; tapping the image itself doesn't close (so it can be studied). */}
      <AnimatePresence>
        {mapOpen && mapImage && (
          <motion.div
            key="map-viewer"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMapOpen(false)}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
          >
            <button
              type="button"
              onClick={() => setMapOpen(false)}
              aria-label="Close map"
              className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-paper/15 text-xl text-paper/85 backdrop-blur transition hover:bg-paper/25 active:scale-95"
              style={{ top: "max(1rem, env(safe-area-inset-top))" }}
            >
              ✕
            </button>
            <motion.img
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              src={assetUrl(mapImage)}
              alt={`${story.title} map`}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90dvh] max-w-[95vw] rounded-card-lg object-contain shadow-overlay ring-1 ring-paper/10"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Arriving in the world" veil — starts black (continuing the home
          dive's fade-out) and lifts on mount, so the route handoff is
          seamless. One-shot; skipped in admin preview. */}
      {!previewMode && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 bg-ink"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      )}
    </div>
  );
}

/** Ask question, rendered like a branch ChoiceButton (the player shouldn't
 *  have to distinguish a question from a choice) — plus a small portrait of
 *  the character being asked, pinned to the right edge. */
function AskChip({
  label,
  iconBase,
  iconFallbackBase,
  onSelect,
}: {
  label: string;
  iconBase?: string;
  iconFallbackBase?: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={choiceButtonClass}>
      <span>{label}</span>
      {iconBase && (
        <span className="absolute right-[15px] top-1/2 h-12 w-12 -translate-y-1/2 overflow-hidden rounded-full bg-paper-deep/40 ring-2 ring-paper/70 shadow-sm">
          <AskAvatar base={iconBase} fallbackBase={iconFallbackBase} alt="" />
        </span>
      )}
    </button>
  );
}

const ASK_ICON_EXTS = [".webp", ".png", ".jpeg", ".jpg"];

/** Tiny character portrait for an ask chip — tries each extension of `base`,
 *  then of `fallbackBase` (the in-scene sprite), like the dialogue portrait. */
function AskAvatar({
  base,
  fallbackBase,
  alt,
}: {
  base: string;
  fallbackBase?: string;
  alt: string;
}) {
  const list = useMemo(
    () => [
      ...ASK_ICON_EXTS.map((e) => base + e),
      ...(fallbackBase ? ASK_ICON_EXTS.map((e) => fallbackBase + e) : []),
    ],
    [base, fallbackBase],
  );
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on path change
    setIdx(0);
    setFailed(false);
  }, [base, fallbackBase]);

  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- extension fallback
    <img
      src={assetUrl(list[idx])}
      alt={alt}
      draggable={false}
      aria-hidden
      className="block h-full w-full object-cover object-top"
      onError={() => {
        if (idx + 1 < list.length) setIdx(idx + 1);
        else setFailed(true);
      }}
    />
  );
}

function EndingPanel({
  endingLabel,
  medalCount,
  totalMedals,
  onReset,
}: {
  endingLabel: string;
  medalCount: number;
  totalMedals: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card-lg bg-paper-deep/60 p-6 text-center ring-1 ring-ink-soft/10 shadow-card">
      <p className="font-handwritten text-3xl text-accent-deep">The End</p>
      {endingLabel && (
        <h2 className="text-2xl font-semibold text-ink">{endingLabel}</h2>
      )}
      <p className="text-base text-ink-soft">
        You earned{" "}
        <span className="font-semibold text-accent-deep">
          {medalCount} / {totalMedals}
        </span>{" "}
        medals on this adventure.
      </p>
      <div className="mt-2 flex flex-wrap items-stretch justify-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-12 items-center justify-center rounded-button bg-accent-deep px-6 text-sm font-medium text-paper shadow-soft transition-transform active:scale-95"
        >
          Play Again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-button bg-paper px-6 text-sm font-medium text-ink-soft ring-1 ring-ink-soft/15 transition-transform active:scale-95"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
