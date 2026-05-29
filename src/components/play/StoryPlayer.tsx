"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  newPlayState,
  takeBranch,
} from "@/lib/story-engine";
import { PatternPuzzle } from "../encounter/PatternPuzzle";
import { loadState, saveState, clearState } from "@/lib/storage";
import { recordEarnedAchievements } from "@/lib/achievements";
import {
  characterAssetSlug,
  formatNarration,
  resolveHeroId,
} from "@/lib/narrative";
import { getAudio, SFX } from "@/lib/audio-engine";
import { prefetchNarration } from "@/lib/tts-prefetch";

import { Backpack, GearSix } from "@phosphor-icons/react";

import { SceneImage } from "./SceneImage";
import { CharacterSpeechBox } from "./CharacterSpeechBox";
import { ChoiceButton, choiceButtonClass } from "./ChoiceButton";
import { SettingsModal } from "./SettingsModal";
import { MedalToast } from "../medals/MedalToast";
import { ItemToast } from "./ItemToast";
import { MedalShelfModal } from "../medals/MedalShelfModal";
import { NarrationAudio } from "../audio/NarrationAudio";
import { SceneDialogueLayer } from "../dialogue/SceneDialogueLayer";
import { EncounterFlow, type EncounterResult } from "../encounter/EncounterFlow";
import { canTalkTo, trimDialogueHistory } from "@/lib/dialogue-personas";
import { buildEncounterQueue } from "@/lib/encounter-engine";
import { getEncounter } from "@/data/encounters";
import { itemIcon, prettyItem } from "@/data/items";
import type { EncounterDef } from "@/types/encounter";

/** Upper bound on the global hero-memory log kept in PlayState. */
const HERO_MEMORY_CAP = 30;

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
  // Scene reward staged at branch-pick, displayed only on arrival at the
  // destination scene (after any outcome page / encounters).
  const [pendingSceneReward, setPendingSceneReward] = useState<{
    sceneId: string;
    items: string[];
    medalId?: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [muted, setMuted] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** True while a SceneDialogueLayer bubble is open — hides the
   *  underlying narration + branch UI to avoid visual overlap. */
  const [dialogueActive, setDialogueActive] = useState(false);
  /** Seeded-conversation request from an ask chip → SceneDialogueLayer. */
  const [askRequest, setAskRequest] = useState<{
    characterId: SpeakerId;
    question: string;
    key: number;
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

  const pendingPuzzle = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "puzzle") return null;
    const branch = story.scenes[i.sourceSceneId]?.branches.find(
      (b) => b.id === i.branchId,
    );
    if (!branch?.puzzle) return null;
    return { branch, puzzle: branch.puzzle, attemptKey: i.attemptKey };
  }, [state.interaction, story.scenes]);

  const pendingOutcome = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "outcome") return null;
    const branch = story.scenes[i.sourceSceneId]?.branches.find(
      (b) => b.id === i.branchId,
    );
    if (!branch?.outcome) return null;
    const medal = i.medalId
      ? medals.medals.find((m) => m.id === i.medalId) ?? null
      : null;
    return {
      branch,
      sourceSceneId: i.sourceSceneId,
      text: branch.outcome,
      items: i.items,
      medal,
    };
  }, [state.interaction, story.scenes, medals.medals]);

  const pendingEncounter: EncounterDef | null = useMemo(() => {
    const i = state.interaction;
    if (!i || i.kind !== "encounter") return null;
    const headId = i.queue[0];
    return headId ? getEncounter(headId) : null;
  }, [state.interaction]);

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

  function handleDialogueClose() {
    setState((prev) => {
      const nextState: PlayState = {
        ...prev,
        dialogueCount: prev.dialogueCount + 1,
        updatedAt: new Date().toISOString(),
      };
      // Check dialogue-count medals.
      const earned: Medal[] = [];
      const already = new Set(nextState.earnedMedals);
      for (const m of medals.medals) {
        if (already.has(m.id)) continue;
        if (
          m.trigger.type === "dialogue_count" &&
          nextState.dialogueCount >= m.trigger.min
        ) {
          earned.push(m);
        }
      }
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
    const savedMute = window.localStorage.getItem("storyranger:muted") === "1";
    if (savedMute) setMuted(true);
    setHydrated(true);
  }, [story, slot, previewMode]);

  // Persist mute preference + propagate to audio engine
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("storyranger:muted", muted ? "1" : "0");
    getAudio().setMuted(muted);
  }, [muted, hydrated]);

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

  // Drive BGM by current scene. Auto-crossfades between scenes.
  // Stop BGM only when StoryPlayer itself unmounts (story exit).
  useEffect(() => {
    const scene = story.scenes[state.currentSceneId];
    if (scene) getAudio().playBgm(scene.bgm, story.id);
  }, [story, state.currentSceneId]);

  useEffect(() => {
    return () => {
      getAudio().stopBgm();
    };
  }, []);

  const currentScene: Scene = story.scenes[state.currentSceneId];
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
    // Branch puzzle gates the reward. Stage it on `interaction` — engine
    // state stays on the source scene until the puzzle resolves, so a
    // refresh re-mounts the same puzzle.
    if (branch.puzzle) {
      setInteraction({
        kind: "puzzle",
        sourceSceneId: state.currentSceneId,
        branchId: branch.id,
        attemptKey: 0,
      });
      return;
    }
    commitBranch(branch, { skipReward: false });
  }

  /** Apply the branch transition. `skipReward` lets the caller suppress
   *  reward grant (used when a puzzle fails in `skip` mode).
   *
   *  When the branch defines an `outcome`, we still apply the engine
   *  state immediately (so rewards/medals are realised) but pause UI on
   *  an "outcome page": same scene art, outcome narration, reward chips
   *  inline. Tap anywhere fires `continueFromOutcome()` and the scene
   *  transition proceeds. */
  function commitBranch(branch: Branch, opts: { skipReward: boolean }) {
    const audio = getAudio();
    audio.playSfx(SFX.PAGE_TURN);
    if (branch.addsCompanion) audio.playSfx(SFX.COMPANION);

    const prevSceneId = state.currentSceneId;

    const result = takeBranch(state, branch, story, medals, opts);
    // Trigger-based medals (checkNewMedals) announce immediately. The entered
    // scene's `reward` (items + reward.medalId) is instead DEFERRED — it shows
    // as toasts only once the player lands on the destination scene (see the
    // scene-reward arrival effect), never on the bridge page.
    if (result.earnedMedals.length > 0) {
      setMedalQueue((q) => [...q, ...result.earnedMedals]);
      audio.playSfx(SFX.MEDAL);
    }
    const sr = result.sceneReward;
    if (sr && ((sr.items?.length ?? 0) > 0 || sr.medalId)) {
      setPendingSceneReward({
        sceneId: branch.next,
        items: sr.items ?? [],
        medalId: sr.medalId,
      });
    }

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
          items: [],
          medalId: undefined,
        },
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
      updatedAt: new Date().toISOString(),
    });
  }

  function continueFromOutcome() {
    if (!pendingOutcome) return;
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

  function handlePuzzleResolved(correct: boolean) {
    if (!pendingPuzzle) return;
    const { branch } = pendingPuzzle;
    if (correct) {
      setInteraction(undefined);
      commitBranch(branch, { skipReward: false });
      return;
    }
    // Fail handling depends on branch.onFailMode.
    if (branch.onFailMode === "retry") {
      setState((s) =>
        s.interaction?.kind === "puzzle"
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
      return;
    }
    // "skip" (or unset → skip default): proceed without reward.
    setInteraction(undefined);
    commitBranch(branch, { skipReward: true });
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

  function applyEncounterResult(res: EncounterResult) {
    // Whole-party defeat → game over. The BattleScreen's TerminalPanel
    // already showed the defeat message; on Continue we wipe the save
    // for this slot and send the player back to the title screen so
    // they can start over. Demo mode follows the same flow (the demo
    // bar's Reset already gives a "Start over" path).
    if (res.outcome === "defeat") {
      clearState(story.id, slot);
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
      const earnedMedals = res.medalId
        ? Array.from(new Set([...prev.earnedMedals, res.medalId]))
        : prev.earnedMedals;
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

      return {
        ...prev,
        completedEncounters: completed,
        inventory,
        earnedMedals,
        companionMoods,
        partyHp,
        fallenAttackers,
        interaction: nextInteraction,
        updatedAt: new Date().toISOString(),
      };
    });

    // The medal is shown on the battle victory panel itself (TerminalPanel),
    // not as a post-Continue toast — so we only fold it into earnedMedals
    // above and don't re-announce it here.
  }

  function handleReset() {
    clearState(story.id, slot);
    setState(newPlayState(story));
    setMedalQueue([]);
    setItemToast(null);
    setPendingSceneReward(null);
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
      itemsGained: [],
      itemsConsumed: [],
      medalId: pendingEncounter.rewards.medalId,
      moodBoost: pendingEncounter.rewards.moodBoost,
    });
    // Only react to skipBattles toggling or a new pendingEncounter
    // appearing — we don't want every state.partyHp tick to retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipBattles, pendingEncounter?.id]);

  const speaker = characterMap[currentScene.speaker];
  const isEnding = !!currentScene.ending;

  // Warm the TTS cache while the player listens to the current scene.
  // For every branch on the current scene, fire-and-forget prefetches for
  // (a) the branch's outcome line (spoken by the current narrator) and
  // (b) the destination scene's narration (spoken by that scene's speaker).
  // First-time visit to either becomes an IndexedDB cache hit on click,
  // skipping the OpenAI roundtrip that the user perceived as "slow start".
  useEffect(() => {
    if (!hydrated || muted) return;
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
    muted,
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

  // Scene reward arrival — fire the medal + item toasts only once the player
  // has actually LANDED on the rewarded scene (outcome bridge dismissed, no
  // encounter overlay). Clearing `pendingSceneReward` stops it re-firing.
  useEffect(() => {
    const r = pendingSceneReward;
    if (!r || r.sceneId !== state.currentSceneId) return;
    if (showingOutcome || pendingEncounter) return;
    // Announce the reward once on arrival; `setPendingSceneReward(null)` below
    // clears the trigger so these can't cascade.
    if (r.medalId) {
      const m = medals.medals.find((x) => x.id === r.medalId);
      if (m) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot reward announce
        setMedalQueue((q) => [...q, m]);
        getAudio().playSfx(SFX.MEDAL);
      }
    }
    if (r.items.length > 0) setItemToast(r.items);
    setPendingSceneReward(null);
  }, [pendingSceneReward, state.currentSceneId, showingOutcome, pendingEncounter, medals]);

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
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
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
            return (
              <div className="flex flex-col items-center gap-3">
                {(pendingOutcome.items.length > 0 || pendingOutcome.medal) && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {pendingOutcome.medal && (
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-amber-300/40 px-3 py-1.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-700/30 shadow-soft">
                        <span aria-hidden>{pendingOutcome.medal.icon}</span>
                        <span>{pendingOutcome.medal.name}</span>
                      </span>
                    )}
                    {pendingOutcome.items.map((id, i) => (
                      <span
                        key={`${id}-${i}`}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-paper/90 px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink-soft/15 shadow-soft"
                      >
                        <span aria-hidden>{itemIcon(id)}</span>
                        <span>{prettyItem(id)}</span>
                      </span>
                    ))}
                  </div>
                )}
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
                endingLabel={currentScene.ending!.label}
                medalCount={state.earnedMedals.length}
                totalMedals={medals.medals.length}
                onReset={handleReset}
              />
            );
          }

          const branches = currentScene.branches;
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
              {askChoices.map((ask, i) =>
                tile(
                  ask.id,
                  i,
                  <AskChip
                    label={ask.label}
                    onSelect={() =>
                      setAskRequest({
                        characterId: ask.characterId,
                        question: ask.label,
                        key: Date.now(),
                      })
                    }
                  />,
                ),
              )}
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
        <NarrationAudio
          text={displayedNarration}
          character={displayedSpeaker}
          muted={muted}
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
          state safely; it remounts after the battle closes. */}
      {!pendingEncounter && (
        <SceneDialogueLayer
          storyId={story.id}
          sceneId={state.currentSceneId}
          sceneSpeaker={currentScene.speaker}
          sceneNarration={displayedNarration}
          hero={state.hero}
          companions={state.companions}
          extraDialogueCharacters={currentScene.dialogueCharacters ?? []}
          characters={characters}
          portraitBase={(id) =>
            dialoguePortraitPath(story.id, id as SpeakerId | CompanionId, heroId)
          }
          mood={(id) => state.companionMoods?.[id as CompanionId] ?? 5}
          hasGifted={(id) => (state.giftedCharacters ?? []).includes(id)}
          heroMemory={state.heroMemory ?? []}
          journeyNote={journeyNote}
          branches={currentScene.branches}
          onTakeBranch={handleChoose}
          history={(id) => state.dialogueHistory?.[id] ?? []}
          askRequest={askRequest}
          onApplyTurn={handleApplyDialogueTurn}
          onSessionClose={() => handleDialogueClose()}
          onActiveChange={setDialogueActive}
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
            key={pendingEncounter.id}
            encounter={pendingEncounter}
            storyId={story.id}
            hero={state.hero}
            companions={state.companions}
            companionMoods={state.companionMoods ?? {}}
            partyHp={state.partyHp ?? { hero: DEFAULT_MAX_HP.hero }}
            partyMaxHp={state.partyMaxHp ?? { hero: DEFAULT_MAX_HP.hero }}
            fallenAttackers={state.fallenAttackers ?? []}
            characterImageBase={(id, mode = "default") => {
              // Honor per-character `image` override when set, but only
              // for the default in-scene sprite. Battle-stance art keeps
              // the id-based convention under /characters/battle/.
              if (mode === "default") {
                const ch = characters.characters.find((c) => c.id === id);
                if (ch?.image) return ch.image;
              }
              return characterImagePath(story.id, id, heroId, mode);
            }}
            heroId={heroId}
            characters={characters.characters}
            inventory={state.inventory ?? []}
            initialBattleState={persistedBattleState}
            onBattleStateChange={handleBattleStateChange}
            onComplete={applyEncounterResult}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* Branch puzzle — overlay shown after picking a branch with
          `puzzle`. `attemptKey` remounts PatternPuzzle for retry. */}
      {pendingPuzzle && (
        <div
          className="fixed inset-0 z-[55] bg-ink/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <PatternPuzzle
            key={`${pendingPuzzle.branch.id}-${pendingPuzzle.attemptKey}`}
            puzzle={pendingPuzzle.puzzle}
            onSolved={handlePuzzleResolved}
          />
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLeave={() => {
          setSettingsOpen(false);
          router.push("/");
        }}
        storyTitle={story.title}
        heroName={state.hero.name}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      />
    </div>
  );
}

/** Ask question, rendered identically to a branch ChoiceButton (the player
 *  shouldn't have to distinguish a question from a choice visually). */
function AskChip({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={choiceButtonClass}>
      <span>{label}</span>
    </button>
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
      <h2 className="text-2xl font-semibold text-ink">{endingLabel}</h2>
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
