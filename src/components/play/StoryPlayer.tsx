"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { preload } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";

import type {
  Branch,
  CharactersFile,
  CompanionId,
  DialogueResponse,
  InteractionState,
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
import { assetUrl, sceneImageWebpUrl } from "@/lib/asset-paths";
import { ChallengeGate } from "../challenge/ChallengeGate";
import { usePlayStateSync } from "@/lib/usePlayStateSync";
import {
  recordEarnedAchievements,
  recordEarnedAchievementsRemote,
} from "@/lib/achievements";
import {
  characterAssetSlug,
  characterSpriteBase,
  formatNarration,
  resolveHeroId,
} from "@/lib/narrative";
import { getAudio, SFX } from "@/lib/audio-engine";
import { prefetchNarration } from "@/lib/tts-prefetch";
import { DEFAULT_TTS_VOICE, type SpeechAlignment } from "@/lib/tts-config";
import type { Howl } from "howler";
import { useChoiceReader } from "@/lib/useChoiceReader";

import { Backpack, DeviceRotate, GearSix, MapTrifold } from "@phosphor-icons/react";

import { SceneImage } from "./SceneImage";
import { CharacterSpeechBox } from "./CharacterSpeechBox";
import {
  ChoiceButton,
  choiceButtonClass,
  choiceStateClass,
  TapAgainBadge,
} from "./ChoiceButton";
import { MicButton } from "../voice/MicButton";
import { SettingsModal } from "./SettingsModal";
import {
  NotificationStack,
  itemChips,
} from "./notifications/NotificationStack";
import { useNotifications } from "./notifications/useNotifications";
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
  // One in-memory queue for ALL top notifications (medal / item / companion).
  // Replaces three separate toast states + their hardcoded stack offsets.
  // push/dismiss/clear are stable (useCallback) — safe as effect deps.
  const {
    queue: notifQueue,
    push: pushNotif,
    dismiss: dismissNotif,
  } = useNotifications();
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
  /** True while the portrait-touch rotate prompt covers the player. The
   *  prompt itself is CSS-only (`portrait:pointer-coarse:`), but covering
   *  is not pausing: the Typewriter would keep typing and SpeechAudio
   *  would narrate behind the overlay, so after rotating the player lands
   *  on an already-finished line (Codex P2). This mirrors the same media
   *  query into state so narration + TTS unmount while blocked and start
   *  fresh on rotate. Admin preview panes skip it (overlay isn't rendered
   *  there either). */
  const [portraitBlocked, setPortraitBlocked] = useState(false);
  useEffect(() => {
    if (previewMode) return;
    const mq = window.matchMedia(
      "(orientation: portrait) and (pointer: coarse)",
    );
    const sync = () => setPortraitBlocked(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [previewMode]);
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
  /** The narration VOICE has finished (or will never play — muted/failed).
   *  Gates the choice read-aloud: the typewriter ending (`narrationDone`)
   *  says nothing about the audio, which usually outlives the typed text. */
  const [narrationAudioDone, setNarrationAudioDone] = useState(false);
  /** Bumped when the child taps the finished narration text → SpeechAudio
   *  replays the already-loaded line (free — no refetch). Monotonic across
   *  scenes; SpeechAudio reacts to the CHANGE, not the value. */
  const [narrationReplayNonce, setNarrationReplayNonce] = useState(0);
  /** The narration's live playback (Howl + character timing) from
   *  SpeechAudio — drives the read-along word highlight. Null while the
   *  clip is fetching and after the line is disposed (scene change). */
  const [narrationPlayback, setNarrationPlayback] = useState<{
    sound: Howl;
    alignment: SpeechAlignment | null;
  } | null>(null);
  /** "One voice at a time" — stop the narration when another voice begins
   *  (choice read-aloud, dialogue, mic). Routed through SpeechAudio's
   *  stopSignal so it also suppresses a line that is STILL FETCHING (a
   *  direct sound.stop() can't reach those — the clip would land seconds
   *  later and speak over whatever interrupted it). The signal carries the
   *  narrationKey CAPTURED AT BUMP TIME: a confirm tap bumps AND changes
   *  the scene in one React batch, so a bare nonce would reach SpeechAudio
   *  when playKey is already the NEXT line's and suppress THAT — silencing
   *  every post-tap scene/outcome narration (+ its tap-to-replay). With the
   *  key attached, a stale signal is simply ignored. The stop settles the
   *  line: read-along brightens, narrationAudioDone gates fire. */
  const [narrationStopSignal, setNarrationStopSignal] = useState<{
    nonce: number;
    key: string;
  } | null>(null);
  // Synced below (after narrationKey is computed) — handlers/effects read
  // the key through this ref so stopNarrationVoice stays referentially
  // stable.
  const narrationKeyRef = useRef("");
  const stopNarrationVoice = useCallback(() => {
    setNarrationStopSignal((s) => ({
      nonce: (s?.nonce ?? 0) + 1,
      key: narrationKeyRef.current,
    }));
  }, []);
  /** Mic is actively recording — gates the narration tap-to-replay (a
   *  replay would speak straight into the child's recording). */
  const [micRecording, setMicRecording] = useState(false);
  // Opening a dialogue must SILENCE the narrator (case: narration audio
  // outlives its hidden text and overlaps the NPC's voice). Edge-triggered
  // on the rising flank only — by the time a branch taken FROM a dialogue
  // loads the next scene's narration, this flag is already false again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- edge-triggered stop signal to the audio layer (nonce), not derived state
    if (dialogueActive) stopNarrationVoice();
  }, [dialogueActive, stopNarrationVoice]);
  // The narrationKey whose entrance animation has settled on screen. Gates the
  // scene-reward toast: "Received …" must appear once the DESTINATION scene is
  // actually visible, not the instant the overlay (battle/outcome) clears —
  // at that point the scene is still cross-fading / zoom-revealing in, so the
  // toast would pop over the OUTGOING scene (most visible right after a battle,
  // where the reveal is slow). Set by the narration block's onAnimationComplete.
  const [enteredNarrationKey, setEnteredNarrationKey] = useState<string | null>(
    null,
  );
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
    return headId ? getEncounter(story.id, headId) : null;
  }, [state.interaction, story.id]);

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
  // Slow fade-to-black when the player taps "Back to Menu" from the ending —
  // we darken over ~1.8s, then route home (mirrors the home→story dive in
  // reverse so leaving feels as deliberate as arriving).
  const [leaving, setLeaving] = useState(false);
  // The "arriving" veil lifts only once the FIRST scene image is actually
  // decode-ready (SceneImage.onReady) — never on a blind timer. So the entrance
  // never holds black after the image could paint, and on a slow network it
  // waits for bytes instead of flashing blank-then-pop. Latches once. (The
  // image is also preloaded during the home dive, so on a normal connection
  // this is already true at mount.)
  const [firstImageReady, setFirstImageReady] = useState(false);
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
      prettyItem(story.id, id),
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
    story.id,
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
        earned.forEach((m) =>
          pushNotif({
            kind: "medal",
            accent: "accent",
            id: `medal:${m.id}`,
            icon: m.icon,
            eyebrow: "New medal!",
            title: m.name,
            durationMs: 2000,
          }),
        );
        getAudio().playSfx(SFX.MEDAL);
        return {
          ...nextState,
          earnedMedals: [...nextState.earnedMedals, ...earned.map((m) => m.id)],
        };
      }
      return nextState;
    });
  }

  // Progress persistence: instant localStorage + (real "play" slot only)
  // debounced Supabase sync, with a DB-first load so progress follows the
  // signed-in player across devices. The admin "demo" slot and per-scene
  // preview stay localStorage-only — they must never load from or overwrite
  // the player's real cross-device save (`play_states` keys on user+story, not
  // the slot), so gate DB sync on the real "play" slot.
  const { load: loadSyncedState, persist: persistState } = usePlayStateSync(
    slot,
    slot === "play" && !previewMode,
  );
  // The exact state object just loaded from the DB/localStorage. The save
  // effect skips persisting it straight back — otherwise merely opening a story
  // would re-write (and bump updated_at on) the loaded snapshot, letting an
  // idle tab clobber newer progress made on another device.
  const skipPersistRef = useRef<PlayState | null>(null);

  // One-shot hydration. Volumes restore SYNCHRONOUSLY (device prefs) so audio
  // inits immediately even if the DB is slow; the PlayState load is async
  // (DB-first, localStorage fallback) and only flips `hydrated` once it
  // resolves — so the black veil (see the `!hydrated` early return) covers the
  // round-trip and the player never flashes a fresh "new game" over real
  // progress. Preview mode skips loading (the parent passed a start scene).
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot restore of device audio prefs on mount
    setVoiceVolume(readVol("storyranger:voiceVolume", DEFAULT_VOLUMES.voice));
    setBgmVolume(readVol("storyranger:bgmVolume", DEFAULT_VOLUMES.bgm));
    setSfxVolume(readVol("storyranger:sfxVolume", DEFAULT_VOLUMES.sfx));

    if (previewMode) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    void loadSyncedState(story.id).then((saved) => {
      if (cancelled) return;
      if (saved && story.scenes[saved.currentSceneId]) {
        skipPersistRef.current = saved;
        setState(saved);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [story, previewMode, loadSyncedState]);

  // Safety net for the arrival veil: if the first image never signals ready
  // (offline, decode failure, or a race), lift the veil anyway after a beat so
  // the player is never stranded on black. SceneImage.onReady normally trips
  // `firstImageReady` well before this fires.
  useEffect(() => {
    if (firstImageReady) return;
    const t = setTimeout(() => setFirstImageReady(true), 3000);
    return () => clearTimeout(t);
  }, [firstImageReady]);

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
    // Preview mode is ephemeral — never persist so closing and re-opening the
    // modal always starts fresh at the chosen scene. persistState writes
    // localStorage instantly and debounce-syncs the real "play" slot to the DB.
    if (hydrated && !previewMode) {
      // Skip persisting the just-loaded snapshot straight back (see skipPersistRef).
      if (skipPersistRef.current === state) {
        skipPersistRef.current = null;
        return;
      }
      persistState(state);
    }
  }, [state, hydrated, previewMode, persistState]);

  // Mirror earned medals into the GLOBAL achievement record (cross-story,
  // separate localStorage key). Medals are achievements, not per-story
  // progress — `recordEarnedAchievements` is an idempotent union, so this
  // also seeds the global store from an existing per-story save on mount.
  // Preview mode stays ephemeral.
  useEffect(() => {
    if (hydrated && !previewMode) {
      recordEarnedAchievements(state.earnedMedals);
      void recordEarnedAchievementsRemote(state.earnedMedals);
    }
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
  // Battle / challenge BGM variant pools — every file named `battle`,
  // `battle_1`, … (and likewise `challenge*`), from EITHER the story or common
  // pool, is an interchangeable variant; one is picked at random per encounter.
  const allBgmKeys = useMemo(
    () => [...new Set([...bgmKeys, ...commonBgmKeys])],
    [bgmKeys, commonBgmKeys],
  );
  const battleBgmVariants = useMemo(
    () => allBgmKeys.filter((k) => k === "battle" || k.startsWith("battle_")),
    [allBgmKeys],
  );
  const challengeBgmVariants = useMemo(
    () =>
      allBgmKeys.filter((k) => k === "challenge" || k.startsWith("challenge_")),
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
        interactionKind === "encounter"
          ? battleBgmVariants
          : challengeBgmVariants;
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
    challengeBgmVariants,
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
  // Dangling branches (next scene not created yet — a normal state during
  // live admin editing, same premise as isTerminalScene) are hidden too:
  // takeBranch throws on a missing scene, so showing one would let the child
  // solve a challenge gate and then go nowhere. They reappear automatically
  // the moment the admin connects the scene.
  const visibleBranches = useMemo(
    () =>
      (currentScene.branches ?? []).filter(
        (b) => story.scenes[b.next] !== undefined && isBranchVisible(b, state),
      ),
    [currentScene, story.scenes, state],
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
   *  inline. The "Tap to Continue" button fires `continueFromOutcome()`
   *  and the scene transition proceeds. */
  function commitBranch(branch: Branch, opts: { skipReward: boolean }) {
    // Defence-in-depth behind the visibleBranches filter: a stale closure or
    // a persisted interaction can still hand us a branch whose destination
    // was deleted mid-session. takeBranch throws on it — but only AFTER the
    // side effects below (ask reset, SFX, companion banner) had fired,
    // leaving "the banner flashed and nothing happened". Bail out FIRST.
    if (!story.scenes[branch.next]) {
      console.warn(
        `[play] branch "${branch.id}" points at missing scene "${branch.next}" — ignored`,
      );
      return;
    }
    // Drop any pending ask so it can't ride an encounter/outcome bridge and
    // auto-open the previous scene's character over the destination scene.
    setAskRequest(null);
    const audio = getAudio();
    // The choice button's click already plays the generic click SFX (global
    // delegated listener below). Here we only add the event-specific cue.
    if (branch.addsCompanions?.length) audio.playSfx(SFX.COMPANION);

    // Announce a REAL party change as a banner. Filter against the current
    // party so a no-op re-join (already present) or an absent removal — which
    // takeBranch silently dedupes — doesn't flash a banner. Names resolve from
    // the character catalog (companion id === character id), falling back to
    // the raw id. Single-slot: a join wins if a branch somehow does both.
    const joined = (branch.addsCompanions ?? []).filter(
      (id) => !state.companions.includes(id),
    );
    const left = (branch.removesCompanions ?? []).filter((id) =>
      state.companions.includes(id),
    );
    if (joined.length > 0) {
      const names = joined.map((id) => characterMap[id]?.name ?? id);
      pushNotif({
        kind: "companion",
        replace: true,
        icon: "🎉",
        title: `${names.join(", ")} joined the party!`,
      });
    } else if (left.length > 0) {
      const names = left.map((id) => characterMap[id]?.name ?? id);
      pushNotif({
        kind: "companion",
        replace: true,
        icon: "👋",
        title: `${names.join(", ")} left the party`,
      });
    }

    const prevSceneId = state.currentSceneId;

    const result = takeBranch(state, branch, story, medals, opts);
    // Metric medals earned by this transition (choices/friends counters)
    // announce immediately. The entered scene's reward ITEMS are deferred —
    // shown as a toast once the player lands on the destination scene (see the
    // scene-reward arrival effect), never on the bridge page.
    if (result.earnedMedals.length > 0) {
      result.earnedMedals.forEach((m) =>
        pushNotif({
          kind: "medal",
          accent: "accent",
          id: `medal:${m.id}`,
          icon: m.icon,
          eyebrow: "New medal!",
          title: m.name,
          durationMs: 2000,
        }),
      );
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
    const queue = buildEncounterQueue(story.id, prevSceneId, branch.id, result.state);
    setState({
      ...result.state,
      interaction:
        queue.length > 0
          ? {
              kind: "encounter",
              sourceSceneId: prevSceneId,
              queue: queue.map((e) => e.id),
            }
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
    const queue = buildEncounterQueue(story.id, sourceSceneId, branch.id, state);
    setInteraction(
      queue.length > 0
        ? {
            kind: "encounter",
            sourceSceneId,
            queue: queue.map((e) => e.id),
          }
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
      if (!previewMode) persistState(next);
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
      // A completed battle (victory or flee) FULLY HEALS the whole party and
      // revives any KO'd member — HP no longer carries between battles. Mirror
      // the defeat branch / retryEncounter idiom: reset partyHp to partyMaxHp
      // and clear fallenAttackers so setupBattle benches no one next time.
      // (res.partyHp / res.fallenAttackers are intentionally ignored here.)
      const partyHp = { ...(prev.partyMaxHp ?? { hero: DEFAULT_MAX_HP.hero }) };
      const fallenAttackers: typeof res.fallenAttackers = [];

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
            ? {
                kind: "encounter",
                sourceSceneId: prev.interaction.sourceSceneId,
                queue: nextQueue,
              }
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
        earned.forEach((m) =>
          pushNotif({
            kind: "medal",
            accent: "accent",
            id: `medal:${m.id}`,
            icon: m.icon,
            eyebrow: "New medal!",
            title: m.name,
            durationMs: 2000,
          }),
        );
        getAudio().playSfx(SFX.MEDAL);
        return {
          ...base,
          earnedMedals: [...base.earnedMedals, ...earned.map((m) => m.id)],
        };
      }
      return base;
    });
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

  // Ending banner reveal. Once the closing narration finishes typing, we hold
  // for a long, deliberate beat and THEN mount the banner. Gating the *mount*
  // (rather than just fading an already-present block) is what keeps the
  // narration anchored where it is during the wait: with nothing below it, the
  // text doesn't pre-shift up. When the timer fires the banner mounts and grows
  // its height in, so the narration rises *with* the banner appearing.
  // Only ever flips on (via the timer); the render gate also checks `isEnding`,
  // so a stale `true` can never surface the banner on a non-ending scene — no
  // synchronous reset needed (and the ending scene is terminal anyway).
  const [endingReveal, setEndingReveal] = useState(false);
  useEffect(() => {
    if (!isEnding || !narrationDone) return;
    const t = setTimeout(() => setEndingReveal(true), 5500);
    return () => clearTimeout(t);
  }, [isEnding, narrationDone]);

  // Warm caches while the player listens to the current scene, for every branch
  // on it: (a) the branch's outcome line + the destination scene's narration
  // (TTS, gated on audio being on), and (b) the destination scene's IMAGE into
  // the browser disk cache — so the cross-fade lands on a cached bitmap instead
  // of flashing the bg while it loads from R2 on first visit. The image warm-up
  // is independent of audio mute.
  useEffect(() => {
    if (!hydrated) return;
    const audioOn = voiceVolume > 0;
    for (const branch of currentScene.branches ?? []) {
      if (audioOn && branch.outcome) {
        // Match the playback voice: an authored `outcomeSpeaker` overrides the
        // scene speaker (else ttsObjectKey differs and this warm-up misses).
        const outSpeaker =
          (branch.outcomeSpeaker
            ? characterMap[branch.outcomeSpeaker]
            : undefined) ?? speaker;
        if (outSpeaker?.voice) {
          void prefetchNarration(
            formatNarration(branch.outcome, state.hero),
            outSpeaker.voice,
            outSpeaker.voiceSpeed ?? 1,
          );
        }
      }
      const nextScene = story.scenes[branch.next];
      if (!nextScene) continue;
      // webp only — every scene ships one; low priority so it yields to the
      // current scene image + audio. React 19 dedupes identical preloads.
      preload(sceneImageWebpUrl(nextScene.image), {
        as: "image",
        fetchPriority: "low",
      });
      if (audioOn) {
        const nextSpeaker = characterMap[nextScene.speaker];
        if (nextSpeaker)
          void prefetchNarration(
            formatNarration(nextScene.narration, state.hero),
            nextSpeaker.voice,
            nextSpeaker.voiceSpeed,
          );
      }
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

  const outcomePrevScene = pendingOutcome
    ? story.scenes[pendingOutcome.sourceSceneId]
    : null;
  const displayedNarration = showingOutcome
    ? formatNarration(pendingOutcome.text, state.hero)
    : formatNarration(currentScene.narration, state.hero);
  const displayedSpeakerId: SpeakerId = showingOutcome
    ? pendingOutcome?.branch.outcomeSpeaker ??
      outcomePrevScene?.speaker ??
      currentScene.speaker
    : currentScene.speaker;
  // During a battle the engine has already advanced currentSceneId to the
  // destination (so the post-battle zoom-reveal lands on the right scene). But
  // the encounter intro dims/blurs whatever scene is painted behind it — if
  // that's the destination, it flashes through before combat. Pin the backdrop
  // to the scene the battle launched FROM until the encounter clears.
  const encounterSourceSceneId =
    state.interaction?.kind === "encounter"
      ? state.interaction.sourceSceneId
      : null;
  const displayedImage = showingOutcome
    ? outcomePrevScene?.image ?? currentScene.image
    : encounterSourceSceneId
      ? story.scenes[encounterSourceSceneId]?.image ?? currentScene.image
      : currentScene.image;
  const displayedSceneKey = showingOutcome
    ? `outcome:${pendingOutcome.branch.id}`
    : encounterSourceSceneId ?? state.currentSceneId;

  // If the speaker is the hero, swap in the player's chosen name (the hero's
  // catalogued name is only a default).
  const baseSpeaker = characterMap[displayedSpeakerId] ?? speaker;
  const displayedSpeaker =
    displayedSpeakerId === heroId && baseSpeaker
      ? { ...baseSpeaker, name: state.hero.name }
      : baseSpeaker;

  const narrationKey = `${displayedSceneKey}:${displayedNarration.slice(0, 40)}`;
  // Mirror for stopNarrationVoice (declared before this point) — a click
  // handler must stamp its stop signal with the key of the line the player
  // was looking at, not whatever a later render computes.
  narrationKeyRef.current = narrationKey;

  // Reset the narration-done gates whenever the narration content changes
  // so the next scene's choices re-enter via the typewriter→fade flow (and
  // the choice read-aloud waits for the NEW scene's voice again).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: narrationKey transition drives the gate reset
    setNarrationDone(false);
    setNarrationAudioDone(false);
  }, [narrationKey]);

  // ── Voice accessibility — choice read-aloud + push-to-talk picker ────
  // Labels in the EXACT order the choices row renders (asks, then branches),
  // so an index from the reader/mic maps 1:1 onto a tile.
  const voiceChoiceLabels = useMemo(() => {
    const asks = pendingEncounter ? [] : visibleAsks;
    return [
      ...asks.map((a) => a.label),
      ...visibleBranches.map((b) => b.label),
    ];
  }, [pendingEncounter, visibleAsks, visibleBranches]);

  /** Resolve a reader/mic index back to the same action its tile performs. */
  function confirmVoiceChoice(index: number) {
    const asks = pendingEncounter ? [] : visibleAsks;
    if (index < asks.length) {
      const ask = asks[index];
      if (ask) {
        setAskRequest({
          characterId: ask.characterId,
          question: ask.label,
          key: Date.now(),
          unlock: ask.unlock,
        });
      }
      return;
    }
    const branch = visibleBranches[index - asks.length];
    if (branch) handleChoose(branch);
  }

  // Tap-to-read only (the auto read-aloud sequence was removed by user
  // decision): the first tap on a choice speaks it, the second confirms.
  const choiceReader = useChoiceReader({
    labels: voiceChoiceLabels,
    // Same narrator voice as the scene so the read-aloud doesn't switch
    // characters mid-beat; labels are static JSON → R2-cacheable.
    voiceId: displayedSpeaker?.voice ?? DEFAULT_TTS_VOICE,
    voiceSpeed: displayedSpeaker?.voiceSpeed ?? 1,
    volume: voiceVolume,
    onConfirm: confirmVoiceChoice,
  });

  // Scene reward arrival — show the item toast only once the player has actually
  // LANDED on the rewarded scene: overlay (outcome/encounter) dismissed AND the
  // destination narration has entered on screen (so it doesn't pop over the
  // outgoing scene mid-transition — most visible right after a battle). Reads
  // the PERSISTED `pendingRewardToast`, so a refresh mid-overlay still surfaces
  // it; clearing it (in state) stops it re-firing. (Medals come from metrics.)
  useEffect(() => {
    const r = state.pendingRewardToast;
    if (!r || r.sceneId !== state.currentSceneId) return;
    if (showingOutcome || pendingEncounter) return;
    if (enteredNarrationKey !== narrationKey) return;
    if (r.items.length > 0)
      pushNotif({
        kind: "item",
        replace: true,
        eyebrow: "Received",
        chips: itemChips(story.id, r.items),
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on arrival; clears the persisted pending toast
    setState((s) => ({ ...s, pendingRewardToast: undefined }));
  }, [
    state.pendingRewardToast,
    state.currentSceneId,
    showingOutcome,
    pendingEncounter,
    enteredNarrationKey,
    narrationKey,
    pushNotif,
    story.id,
  ]);

  // `fixed inset-0` (instead of `relative h-dvh w-dvw`) pins the player
  // root to the viewport edges directly, independent of any parent
  // context — body padding, flex layout, iOS Safari's implicit
  // `viewport-fit: cover` safe-area injection, scrollbar gutters, etc.
  // The earlier `relative w-dvw` setup left a thin strip of body bg on
  // the LEFT of iPad / desktop Chrome alike, because the player was
  // being placed inside body's content area (which an outer layer was
  // insetting). Fixed positioning sees the viewport directly — no
  // ambiguity, no math, no per-browser quirks.
  // Until the one-shot localStorage hydration completes, render a neutral
  // black cover instead of the player. This avoids painting the START scene on
  // the first frame before the saved scene is restored: `setState(saved)` and
  // `setHydrated(true)` live in the same effect, so React batches them and the
  // very first PLAYER render already shows the saved scene — no flash, and no
  // 2.4s cross-fade jump (the scene mounts directly at the saved key). It's
  // also SSR-safe: the server and the first client render both emit this same
  // cover, so there's no hydration mismatch. Preview mode has its scene from
  // the initializer and no save to load, so it skips the gate (unchanged).
  if (!previewMode && !hydrated) {
    return <div className="fixed inset-0 z-0 bg-ink" aria-hidden />;
  }

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
        transition={{ duration: 2.8, ease: [0.16, 1, 0.3, 1] }}
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
            <SceneImage
              src={displayedImage}
              alt={`${story.title} — scene`}
              onReady={() => setFirstImageReady(true)}
            />
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
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 px-safe sm:px-safe-lg"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-2 sm:gap-3">{extraTopBar}</div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setShelfOpen(true)}
            aria-label="View your treasures"
            className="flex h-11 items-center gap-2 rounded-pill bg-paper/85 px-4 text-base ring-1 ring-ink-soft/10 backdrop-blur transition-colors hover:bg-paper short:h-9 short:gap-1.5 short:px-3 short:text-sm"
          >
            <Backpack
              size={22}
              weight="duotone"
              className="text-accent short:size-[18px]"
            />
            <span className="font-semibold text-ink tabular-nums">
              {(state.inventory ?? []).length}
            </span>
          </button>
          {mapImage && (
            <button
              type="button"
              onClick={() => setMapOpen(true)}
              aria-label="View the map"
              className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper/85 text-ink-soft ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper hover:text-ink active:scale-90 short:h-9 short:w-9"
            >
              <MapTrifold
                size={22}
                weight="duotone"
                className="short:size-[18px]"
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="flex h-11 w-11 items-center justify-center rounded-pill bg-paper/85 text-ink-soft ring-1 ring-ink-soft/10 backdrop-blur transition-all hover:bg-paper hover:text-ink active:scale-90 short:h-9 short:w-9"
          >
            <GearSix
              size={22}
              weight="duotone"
              className="short:size-[18px]"
            />
          </button>
        </div>
      </header>

      {/* Bottom layout — narration (above), choices row (below). Hidden
          while a dialogue bubble is open so the two UIs don't overlap.
          NOT an outcome tap target (it used to be) — advancing goes through
          the "Tap to Continue" button only, so tapping the outcome
          narration replays it instead of skipping the page. */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch gap-3 px-safe pb-safe transition-opacity duration-200 sm:px-safe-lg lg:pb-safe-lg lg:gap-4 short:gap-2 short:pb-safe-sm ${
          dialogueActive ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={dialogueActive}
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
                text. With it unmounted, only the new scene's narration mounts.
                Same for `portraitBlocked`: while the rotate prompt covers the
                player the Typewriter must not advance (or finish) the line
                behind it — unmounted here, it types from the start once the
                device rotates back to landscape. */}
            {!pendingEncounter && !dialogueActive && !portraitBlocked && (
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
                // Entrance settled → this scene's narration is on screen. Gates
                // the scene-reward toast (see the pendingRewardToast effect) so
                // "Received …" never pops over the outgoing scene mid-transition.
                // The exiting old block fires this too, but with its own (stale)
                // narrationKey, so the toast's `=== narrationKey` guard ignores it.
                onAnimationComplete={() => setEnteredNarrationKey(narrationKey)}
                // No fixed height cap — the narration block grows up
                // from the bottom (parent is `absolute bottom-0 flex
                // flex-col`), so longer text simply raises its top Y while
                // the choice row stays anchored at the bottom. A safety
                // ceiling of 60dvh keeps a worst-case multi-paragraph
                // narration from covering the whole scene — tightened to
                // 40dvh on landscape phones, where 60dvh of a 393px-tall
                // viewport left almost no scene visible.
                className={`max-h-[60dvh] short:max-h-[40dvh] overflow-y-auto pr-2${
                  narrationDone && voiceVolume > 0 ? " cursor-pointer" : ""
                }`}
                // Tap-to-replay, mirroring the choice buttons' "tap = hear
                // it" pattern — the read-along highlight re-runs with the
                // replay (it follows the audio clock). Stops the choice
                // read-aloud first so narrator + reader don't overlap.
                onClick={() => {
                  // No replay while the mic is open — the narrator would
                  // speak straight into the child's recording.
                  if (!narrationDone || voiceVolume <= 0 || micRecording) {
                    return;
                  }
                  choiceReader.stopAll();
                  setNarrationReplayNonce((n) => n + 1);
                }}
              >
                <CharacterSpeechBox
                  speaker={displayedSpeakerId}
                  characterName={displayedSpeaker?.name ?? "Narrator"}
                  characterColor={displayedSpeaker?.color ?? "#5a4128"}
                  narration={displayedNarration}
                  variant="overlay"
                  playbackSound={narrationPlayback?.sound ?? null}
                  alignment={narrationPlayback?.alignment ?? null}
                  // Mirrors the SpeechAudio mount condition below — within
                  // this block pendingEncounter/portraitBlocked are already
                  // false, so only the volume + speaker checks remain.
                  expectAudio={
                    voiceVolume > 0 && hydrated && !!displayedSpeaker
                  }
                  audioDone={narrationAudioDone}
                  onTypingDone={() => setNarrationDone(true)}
                />
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* Choices row — horizontal at the very bottom. While an outcome
            is pending, we replace the choice row with a "Tap to Continue"
            button. The button (not the whole screen) is the ONLY advance
            target — a full-screen overlay used to swallow every tap, which
            made the outcome narration impossible to tap-replay. */}
        {(() => {
          if (showingOutcome && pendingOutcome) {
            // Outcome bridge shows only the outgoing-scene pause + outcome text.
            // Rewards surface as toasts on the destination scene; metric medals
            // toast separately.
            return (
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={continueFromOutcome}
                  className="rounded-pill bg-paper/85 px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-ink shadow-button ring-1 ring-ink-soft/15 backdrop-blur-sm transition-all hover:bg-paper hover:ring-accent/50 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:shadow-button-pressed"
                >
                  Tap to Continue
                </button>
              </div>
            );
          }
          if (isEnding) {
            // Stays unmounted through the closing narration AND the long pause
            // after it (see the endingReveal timer above), so the narration
            // holds its position until the banner is actually ready to appear.
            if (!endingReveal) return null;
            return (
              <EndingPanel
                endingLabel={currentScene.ending?.label ?? ""}
                medalCount={state.earnedMedals.length}
                totalMedals={medals.medals.length}
                onBackToMenu={() => setLeaving(true)}
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
          // a left-right row (already sized for up to 4 via flex-1). On short
          // screens the explicit 30% basis (vs flex-1's basis-0) makes the
          // wrapping row cap itself at 3 tiles per line even below the `sm`
          // width gate — narrow phone-size windows otherwise stacked every
          // choice full-width and buried the scene.
          const tile = (key: string, i: number, node: ReactNode) => (
            <motion.div
              key={key}
              className={
                choiceCount === 1
                  ? "w-full sm:w-2/5 short:w-3/5"
                  : "min-w-0 flex-1 short:basis-[30%]"
              }
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
                  : "flex flex-col items-stretch gap-3 sm:flex-row lg:gap-4 short:flex-row short:flex-wrap short:justify-center short:gap-2"
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
                    reading={choiceReader.readingIndex === i}
                    armed={choiceReader.armedIndex === i}
                    // Two-step: first tap reads the label aloud + arms, the
                    // second tap confirms (the reader degrades to single-tap
                    // when the voice channel is muted). One voice at a time:
                    // the read-aloud silences a still-speaking narrator.
                    onSelect={() => {
                      stopNarrationVoice();
                      choiceReader.tap(i);
                    }}
                  />,
                );
              })}
              {branches.map((branch, i) =>
                tile(
                  branch.id,
                  askChoices.length + i,
                  <ChoiceButton
                    branch={branch}
                    reading={
                      choiceReader.readingIndex === askChoices.length + i
                    }
                    armed={choiceReader.armedIndex === askChoices.length + i}
                    onSelect={() => {
                      stopNarrationVoice();
                      choiceReader.tap(askChoices.length + i);
                    }}
                  />,
                ),
              )}
              {/* Push-to-talk — say a choice instead of tapping it. Renders
                  nothing when unsupported/denied/cooling, so the row is
                  byte-identical to the pre-voice UI in those cases. Gated on
                  the narration VOICE having finished (not just the
                  typewriter) — an open mic under a still-speaking narrator
                  would record the narrator. Muted voice channel → no audio
                  to wait for. */}
              {narrationDone && (voiceVolume <= 0 || narrationAudioDone) && (
                <div className="flex shrink-0 items-center justify-center self-center">
                  <MicButton
                    labels={voiceChoiceLabels}
                    onMatch={(i) => {
                      getAudio().playSfx(SFX.CHOICE);
                      confirmVoiceChoice(i);
                    }}
                    onRecordingStart={() => {
                      // One voice at a time, and NOTHING into the mic: stop
                      // the read-aloud AND a still/again-playing narrator.
                      choiceReader.stopAll();
                      stopNarrationVoice();
                    }}
                    onRecordingChange={setMicRecording}
                    size="row"
                  />
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* (The former full-screen tap-to-continue overlay is gone: it sat
          over the narration and swallowed the tap-to-replay. Advancing now
          happens ONLY via the "Tap to Continue" button in the bottom row.) */}

      {/* `!portraitBlocked` — don't narrate behind the rotate prompt; the
          remount after rotating replays this line from the start. */}
      {hydrated && displayedSpeaker && !pendingEncounter && !portraitBlocked && (
        <SpeechAudio
          text={displayedNarration}
          voiceId={displayedSpeaker.voice}
          voiceSpeed={displayedSpeaker.voiceSpeed}
          volume={voiceVolume}
          playKey={narrationKey}
          onSettled={() => setNarrationAudioDone(true)}
          replayNonce={narrationReplayNonce}
          stopSignal={narrationStopSignal}
          onPlayback={(sound, alignment) =>
            setNarrationPlayback(sound ? { sound, alignment } : null)
          }
        />
      )}

      <NotificationStack queue={notifQueue} onDismiss={dismissNotif} />

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
        storyId={story.id}
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
            alreadyCleared={(state.completedEncounters ?? []).includes(
              pendingEncounter.id,
            )}
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
              className="absolute flex h-11 w-11 items-center justify-center rounded-full bg-paper/15 text-xl text-paper/85 backdrop-blur transition hover:bg-paper/25 active:scale-95 short:h-9 short:w-9 short:text-base"
              style={{
                top: "max(1rem, env(safe-area-inset-top))",
                right: "max(1rem, env(safe-area-inset-right))",
              }}
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

      {/* Landscape-only premise: the play layout is designed for landscape
          (a 16:9 scene under cover-crop keeps ≥75% of the art there, vs 26%
          in phone portrait). On portrait TOUCH devices show a rotate prompt
          instead of a broken layout — `pointer-coarse` exempts tall desktop
          windows, and admin preview panes skip it entirely. Pure CSS gate:
          game state is untouched, rotating resumes play instantly. */}
      {!previewMode && (
        <div
          role="status"
          className="absolute inset-0 z-[110] hidden flex-col items-center justify-center gap-4 bg-ink/95 px-8 text-center backdrop-blur-sm portrait:pointer-coarse:flex"
        >
          <DeviceRotate
            size={56}
            weight="duotone"
            className="text-accent"
            aria-hidden
          />
          <p className="text-xl font-semibold text-paper">
            Rotate your device
          </p>
          <p className="text-sm text-paper/70">
            This story plays in landscape
          </p>
        </div>
      )}

      {/* "Arriving in the world" veil — starts black (continuing the home
          dive's fade-out) and lifts ONLY once the first scene image is
          decode-ready (`firstImageReady`), never on a blind timer. So the
          image is already painted behind the veil as it lifts (a true fade-up,
          not black-then-pop), and a slow network correctly waits for bytes.
          With the dive-time preload the image is usually ready at mount, so the
          veil lifts right away. One-shot; skipped in admin preview. */}
      {!previewMode && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-40 bg-ink"
          initial={{ opacity: 1 }}
          animate={{ opacity: firstImageReady ? 0 : 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      )}

      {/* Leaving veil — slow fade-to-black when the player chooses "Back to
          Menu" from the ending, then route home. The reverse of the arrival
          veil above, so the exit feels as unhurried as the entrance. */}
      <AnimatePresence>
        {leaving && (
          <motion.div
            key="leave-veil"
            aria-hidden
            className="absolute inset-0 z-[100] bg-ink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.8, ease: "easeIn" }}
            onAnimationComplete={() => router.push("/")}
          />
        )}
      </AnimatePresence>
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
  reading,
  armed,
  onSelect,
}: {
  label: string;
  iconBase?: string;
  iconFallbackBase?: string;
  /** Read-aloud is playing this label (highlight while it speaks). */
  reading?: boolean;
  /** First tap landed — next tap confirms. */
  armed?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={choiceButtonClass + choiceStateClass(reading, armed)}
    >
      {armed && <TapAgainBadge />}
      {/* Text centers within the space LEFT of the portrait (flex-1), not the
          whole button — keeps a long question from clipping under the avatar
          while a wide gap sits empty on the left. */}
      <span className="min-w-0 flex-1 text-center">{label}</span>
      {iconBase && (
        // -mr-2 pulls the portrait toward the pill's right edge so its gap
        // there matches the vertical one: h-20 pill − h-12 avatar = 16px
        // top/bottom, but px-6 left 24px on the right. (short: py-1.5 ≈ 6px
        // vertical vs px-3 = 12px → -1.5.)
        <span className="-mr-2 h-12 w-12 shrink-0 overflow-hidden rounded-full bg-paper-deep/40 ring-2 ring-paper/70 shadow-sm short:-mr-1.5 short:h-7 short:w-7">
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
  onBackToMenu,
}: {
  endingLabel: string;
  medalCount: number;
  totalMedals: number;
  onBackToMenu: () => void;
}) {
  return (
    // Mounts only when the caller's reveal timer fires (the long post-narration
    // pause has already elapsed by then). Animating height 0 → auto grows the
    // banner's layout footprint as it fades in, so the narration above it rises
    // smoothly *with* the banner rather than jumping up beforehand. overflow
    // hidden clips the padding while the height is mid-grow.
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 1.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-4 overflow-hidden rounded-card-lg bg-paper-deep/60 p-6 text-center ring-1 ring-ink-soft/10 shadow-card"
    >
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
          onClick={onBackToMenu}
          className="inline-flex min-h-12 items-center justify-center rounded-button bg-paper px-6 text-sm font-medium text-ink-soft ring-1 ring-ink-soft/15 transition-transform active:scale-95"
        >
          Back to Menu
        </button>
      </div>
    </motion.div>
  );
}
