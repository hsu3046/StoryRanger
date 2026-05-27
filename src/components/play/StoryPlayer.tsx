"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type {
  Branch,
  CharactersFile,
  CompanionId,
  DialogueMessage,
  DialogueResponse,
  Medal,
  MedalsFile,
  NarrateResponse,
  PlayState,
  Scene,
  SpeakerId,
  Story,
} from "@/types/story";
import {
  applyNarrateResponse,
  DEFAULT_MAX_HP,
  newPlayState,
  takeBranch,
} from "@/lib/story-engine";
import { loadState, saveState, clearState } from "@/lib/storage";
import { formatNarration } from "@/lib/narrative";
import { getAudio, SFX } from "@/lib/audio-engine";

import { Backpack, GearSix } from "@phosphor-icons/react";

import { SceneImage } from "./SceneImage";
import { CharacterSpeechBox } from "./CharacterSpeechBox";
import { ChoiceButton } from "./ChoiceButton";
import { FreeInput } from "./FreeInput";
import { SettingsModal } from "./SettingsModal";
import { MedalToast } from "../medals/MedalToast";
import { MedalShelfModal } from "../medals/MedalShelfModal";
import { NarrationAudio } from "../audio/NarrationAudio";
import { CompanionRail } from "../dialogue/CompanionRail";
import { DialogueModal } from "../dialogue/DialogueModal";
import { EncounterFlow, type EncounterResult } from "../encounter/EncounterFlow";
import { trimDialogueHistory } from "@/lib/dialogue-personas";
import { pickEncounterFor } from "@/lib/encounter-engine";
import type { EncounterDef } from "@/types/encounter";

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
  mode: "default" | "battle" = "default",
): string {
  const filename = id === "dorothy" ? "hero" : id;
  const folder = mode === "battle" ? "characters/battle" : "characters";
  return `/stories/${storyId}/${folder}/${filename}`;
}

interface Props {
  story: Story;
  medals: MedalsFile;
  characters: CharactersFile;
}

interface NarrationOverride {
  text: string;
  speaker: SpeakerId;
  /** Scene this override belongs to — cleared when the player moves on. */
  appliesToSceneId: string;
}

export function StoryPlayer({ story, medals, characters }: Props) {
  const [state, setState] = useState<PlayState>(() => newPlayState(story));
  const [medalQueue, setMedalQueue] = useState<Medal[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [narrationOverride, setNarrationOverride] =
    useState<NarrationOverride | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [muted, setMuted] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialogueWith, setDialogueWith] = useState<SpeakerId | null>(null);
  const [pendingEncounter, setPendingEncounter] =
    useState<EncounterDef | null>(null);
  const router = useRouter();

  function openDialogueWith(id: SpeakerId) {
    setDialogueWith(id);
  }

  function handleApplyDialogueTurn(
    targetId: SpeakerId,
    resp: DialogueResponse,
    userText: string,
  ) {
    setState((prev) => {
      const currentMood =
        (prev.companionMoods?.[targetId as CompanionId] ?? 5);
      const nextMood = Math.max(
        0,
        Math.min(10, currentMood + (resp.moodDelta ?? 0)),
      );

      const turns: DialogueMessage[] = [
        ...(prev.dialogueHistory?.[targetId] ?? []),
        { role: "hero", text: userText },
        { role: "character", text: resp.reply },
      ];
      const trimmed = trimDialogueHistory(turns, 12);

      // Inventory keeps duplicates so the bag UI can show ×N counts.
      const inventory = resp.itemGift
        ? [...(prev.inventory ?? []), resp.itemGift]
        : prev.inventory;

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
        updatedAt: new Date().toISOString(),
      };
    });

    if (resp.endsConversation) {
      // Give the user 2.5s to read the final line then auto-close.
      setTimeout(() => setDialogueWith(null), 2500);
    }
  }

  // One-shot hydration from localStorage.
  useEffect(() => {
    const saved = loadState(story.id);
    if (saved && story.scenes[saved.currentSceneId]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration
      setState(saved);
    }
    const savedMute = window.localStorage.getItem("storyranger:muted") === "1";
    if (savedMute) setMuted(true);
    setHydrated(true);
  }, [story]);

  // Persist mute preference + propagate to audio engine
  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("storyranger:muted", muted ? "1" : "0");
    getAudio().setMuted(muted);
  }, [muted, hydrated]);

  useEffect(() => {
    if (hydrated) saveState(state);
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
  const characterMap = useMemo(() => {
    const map: Record<string, (typeof characters.characters)[number]> = {};
    for (const c of characters.characters) map[c.id] = c;
    return map;
  }, [characters]);

  function handleChoose(branch: Branch) {
    setNarrationOverride(null);
    const audio = getAudio();
    audio.playSfx(SFX.PAGE_TURN);
    if (branch.addsCompanion) audio.playSfx(SFX.COMPANION);
    const result = takeBranch(state, branch, story, medals);
    setState(result.state);
    if (result.earnedMedals.length > 0) {
      setMedalQueue((q) => [...q, ...result.earnedMedals]);
      audio.playSfx(SFX.MEDAL);
    }
    // v2.0 — roll for a side encounter after entering the new main scene
    const enc = pickEncounterFor(result.state.currentSceneId, result.state);
    if (enc) setPendingEncounter(enc);
  }

  function applyEncounterResult(res: EncounterResult) {
    setState((prev) => {
      const completed = Array.from(
        new Set([...(prev.completedEncounters ?? []), res.encounterId]),
      );
      // Keep duplicates — the bag groups by id and shows ×N for counts.
      const inventory = res.itemsGained.length
        ? [...(prev.inventory ?? []), ...res.itemsGained]
        : prev.inventory;
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
      // Boss encounters may force the next main scene.
      const currentSceneId = res.forceNextSceneId
        ? story.scenes[res.forceNextSceneId]
          ? res.forceNextSceneId
          : prev.currentSceneId
        : prev.currentSceneId;

      // Battle encounters return updated party HP; story encounters pass null.
      const partyHp = res.partyHp ?? prev.partyHp ?? {};
      const fallenAttackers = res.fallenAttackers.length
        ? Array.from(
            new Set([...(prev.fallenAttackers ?? []), ...res.fallenAttackers]),
          )
        : prev.fallenAttackers;

      return {
        ...prev,
        currentSceneId,
        completedEncounters: completed,
        inventory,
        earnedMedals,
        companionMoods,
        partyHp,
        fallenAttackers,
        updatedAt: new Date().toISOString(),
      };
    });

    if (res.medalId) {
      // Look up medal in catalog so the toast UI can show it
      const m = medals.medals.find((x) => x.id === res.medalId);
      if (m) setMedalQueue((q) => [...q, m]);
      getAudio().playSfx(SFX.MEDAL);
    }
    setPendingEncounter(null);
  }

  async function handleFreeInput(text: string) {
    if (isNarrating) return;
    setIsNarrating(true);
    getAudio().playSfx(SFX.SEND);
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId: story.id,
          sceneId: state.currentSceneId,
          freeInput: text,
          hero: state.hero,
          companions: state.companions,
        }),
      });
      if (!res.ok) throw new Error(`narrate ${res.status}`);
      const data = (await res.json()) as NarrateResponse;
      const result = applyNarrateResponse(state, data, story, medals);
      setNarrationOverride({
        text: data.narration,
        speaker: data.speaker,
        appliesToSceneId: data.nextSceneId,
      });
      setState(result.state);
      if (result.earnedMedals.length > 0) {
        setMedalQueue((q) => [...q, ...result.earnedMedals]);
        getAudio().playSfx(SFX.MEDAL);
      }
    } catch (err) {
      console.warn("[narrate] request failed", err);
      setNarrationOverride({
        text: "Dorothy pauses, as if the wind has muffled her voice. Try a different idea.",
        speaker: currentScene.speaker,
        appliesToSceneId: state.currentSceneId,
      });
    } finally {
      setIsNarrating(false);
    }
  }

  function handleReset() {
    clearState(story.id);
    setState(newPlayState(story));
    setMedalQueue([]);
    setNarrationOverride(null);
  }

  const speaker = characterMap[currentScene.speaker];
  const isEnding = !!currentScene.ending;

  const overrideActive =
    !!narrationOverride &&
    narrationOverride.appliesToSceneId === state.currentSceneId;

  const rawNarration = overrideActive
    ? narrationOverride!.text
    : currentScene.narration;
  const displayedNarration = formatNarration(rawNarration, state.hero);

  const displayedSpeakerId: SpeakerId = overrideActive
    ? narrationOverride!.speaker
    : currentScene.speaker;

  // If the speaker is the hero (dorothy), swap in the player's chosen name.
  const baseSpeaker = characterMap[displayedSpeakerId] ?? speaker;
  const displayedSpeaker =
    displayedSpeakerId === "dorothy" && baseSpeaker
      ? { ...baseSpeaker, name: state.hero.name }
      : baseSpeaker;

  const narrationKey = `${state.currentSceneId}:${displayedNarration.slice(0, 40)}`;

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-ink">
      {/* Full-bleed scene image as background — both old & new in DOM at
          the same time so the swap is a true cross-fade. Long duration for
          a slow, painterly transition between storybook pages. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={`img-${state.currentSceneId}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.4, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <SceneImage src={currentScene.image} alt={`${story.title} — scene`} />
        </motion.div>
      </AnimatePresence>

      {/* Top + bottom gradient veils for UI legibility over the image */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-ink/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-ink/55 via-ink/15 to-transparent" />

      {/* Top header — floating over the image (right side only) */}
      <header
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-3 px-4 sm:px-6"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
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

      {/* Bottom layout — narration (above), choices row (below). Choices
          stretch horizontally across the full width so they cover the
          minimum amount of the scene image. */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-stretch gap-3 px-4 pb-4 sm:px-6 sm:pb-6 sm:gap-4"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        {/* Narration — cinematic subtitle style. Block centered + text
            centered so left/right margins look identical regardless of
            line length. text-balance keeps each line a similar length. */}
        <div className="mx-auto w-[85%] max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`narr-${narrationKey}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="max-h-[28dvh] overflow-y-auto pr-2"
            >
              <CharacterSpeechBox
                speaker={displayedSpeakerId}
                characterName={displayedSpeaker?.name ?? "Narrator"}
                characterColor={displayedSpeaker?.color ?? "#5a4128"}
                narration={displayedNarration}
                variant="overlay"
              />
            </motion.div>
          </AnimatePresence>

          {isNarrating && (
            <div className="mt-2 inline-flex items-center gap-2.5 rounded-pill bg-paper/85 px-3 py-1.5 text-sm text-ink-soft backdrop-blur">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              <span>The story is unfolding…</span>
            </div>
          )}
        </div>

        {/* Choices row — horizontal at the very bottom.
            Width ratio (total elements in the row, free input always last):
              1 element (single branch, no free) → 40% centered
              2 elements (1 branch + free)       → 40 / 60        (2 : 3)
              3 elements (2 branches + free)     → 30 / 30 / 40   (3 : 3 : 4)
              4 elements (3 branches + free)     → 20 / 20 / 20 / 40 (1 : 1 : 1 : 2)
              N branches, no free                → evenly split */}
        {(() => {
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
          const hasFree = !!currentScene.allowFreeInput;
          const total = branches.length + (hasFree ? 1 : 0);

          if (total === 1) {
            const branch = branches[0];
            return (
              <div className="flex justify-center">
                <div className="w-full sm:w-2/5">
                  <ChoiceButton
                    branch={branch}
                    disabled={isNarrating}
                    onSelect={handleChoose}
                  />
                </div>
              </div>
            );
          }

          // flex ratios for branch vs free input depending on total count
          let branchFlex = 1;
          let freeFlex = 1;
          if (total === 2) {
            branchFlex = 2;
            freeFlex = 3;
          } else if (total === 3) {
            branchFlex = 3;
            freeFlex = 4;
          } else if (total === 4) {
            branchFlex = 1;
            freeFlex = 2;
          }

          return (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:gap-4">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className="min-w-0 sm:flex-[var(--branch-flex)]"
                  style={
                    {
                      "--branch-flex": branchFlex,
                    } as React.CSSProperties
                  }
                >
                  <ChoiceButton
                    branch={branch}
                    disabled={isNarrating}
                    onSelect={handleChoose}
                  />
                </div>
              ))}

              {hasFree && (
                <div
                  className="min-w-0 sm:flex-[var(--free-flex)]"
                  style={
                    {
                      "--free-flex": freeFlex,
                    } as React.CSSProperties
                  }
                >
                  <FreeInput
                    hint={
                      currentScene.freeInputHint
                        ? formatNarration(
                            currentScene.freeInputHint,
                            state.hero,
                          )
                        : undefined
                    }
                    disabled={isNarrating}
                    onSubmit={handleFreeInput}
                  />
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {hydrated && displayedSpeaker && (
        <NarrationAudio
          text={displayedNarration}
          character={displayedSpeaker}
          muted={false}
          playKey={narrationKey}
        />
      )}

      <MedalToast
        medal={medalQueue[0] ?? null}
        onDismiss={() => setMedalQueue((q) => q.slice(1))}
      />

      {/* Companion dialogue rail (left edge) */}
      <CompanionRail
        companions={state.companions}
        moods={state.companionMoods ?? {}}
        imageBase={(id) => characterImagePath(story.id, id)}
        characterColor={(id) =>
          characterMap[id as SpeakerId]?.color ?? "#5a4128"
        }
        characterName={(id) =>
          characterMap[id as SpeakerId]?.name ?? id
        }
        onTalk={(id) => openDialogueWith(id as SpeakerId)}
      />

      {/* Dialogue modal */}
      {dialogueWith && (() => {
        const char = characterMap[dialogueWith];
        if (!char) return null;
        const moodKey = dialogueWith as CompanionId;
        const mood = state.companionMoods?.[moodKey] ?? 5;
        return (
          <DialogueModal
            open
            storyId={story.id}
            characterId={dialogueWith}
            characterName={char.name}
            characterColor={char.color}
            characterImageBase={characterImagePath(story.id, dialogueWith)}
            mood={mood}
            hero={state.hero}
            sceneId={state.currentSceneId}
            sceneNarration={displayedNarration}
            companions={state.companions}
            history={state.dialogueHistory?.[dialogueWith] ?? []}
            onApplyTurn={(resp, userText) =>
              handleApplyDialogueTurn(dialogueWith, resp, userText)
            }
            onClose={() => setDialogueWith(null)}
          />
        );
      })()}

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
            characterImageBase={(id, mode = "default") =>
              characterImagePath(story.id, id, mode)
            }
            onComplete={applyEncounterResult}
            onOpenSettings={() => setSettingsOpen(true)}
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
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
      />
    </div>
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
