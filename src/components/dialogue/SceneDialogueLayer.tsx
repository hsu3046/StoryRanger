"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type {
  Branch,
  CharactersFile,
  CompanionId,
  DialogueMessage,
  DialogueResponse,
  Hero,
  SpeakerId,
} from "@/types/story";
import { canTalkTo } from "@/lib/dialogue-personas";
import { assetUrl } from "@/lib/asset-paths";
import { SpeechAudio } from "../audio/SpeechAudio";
import { DialogueBubble } from "./DialogueBubble";
import { DialogueChoiceCards } from "./DialogueChoiceCards";

interface Props {
  storyId: string;
  sceneId: string;
  sceneNarration: string;
  hero: Hero;
  /** Voice volume (0–1) — character replies are spoken via ElevenLabs TTS on
   *  this channel, same as scene narration. */
  voiceVolume: number;
  /** Party companions — used as dialogue CONTEXT for the LLM (not auto-added
   *  to the rail; the rail is the scene's opted-in Interactive Characters). */
  companions: CompanionId[];
  /** The scene's Interactive Characters (`Scene.dialogueCharacters`) — the
   *  authoritative rail roster alongside a dialogue-able scene speaker. */
  extraDialogueCharacters: SpeakerId[];
  characters: CharactersFile;
  /** Resolve a portrait base path (no extension) for the rail thumbnails.
   *  Convention: `/stories/<storyId>/dialogue/<characterId>` (1024×1024). */
  portraitBase: (id: SpeakerId) => string;
  /** Fallback base when no dedicated dialogue head-shot exists — the in-scene
   *  sprite (honors the `image` override). Keeps freshly added characters from
   *  rendering as a blank color disc. */
  portraitFallbackBase?: (id: SpeakerId) => string;
  /** Current mood per character (from PlayState.companionMoods or 5). */
  mood: (id: SpeakerId) => number;
  /** Whether this character has already gifted the hero (gate input). */
  hasGifted: (id: SpeakerId) => boolean;
  /** Cross-character memory of things the hero has shared (global). */
  heroMemory: string[];
  /** Deterministic "adventures so far" one-liner (medals, items, etc.). */
  journeyNote: string;
  /** Current scene branches — surfaced as "advance the story" choices
   *  alongside the LLM reply suggestions while a dialogue is open. */
  branches: Branch[];
  /** Take a branch picked mid-dialogue (the layer closes the conversation
   *  first, then this navigates to the next scene). */
  onTakeBranch: (branch: Branch) => void;
  /** Latest dialogue history per character (sliding window). */
  history: (id: SpeakerId) => DialogueMessage[];
  onApplyTurn: (
    characterId: SpeakerId,
    resp: DialogueResponse,
    heroText: string,
  ) => void;
  onSessionClose: (characterId: SpeakerId) => void;
  /** Fires whenever a dialogue opens / closes — caller hides the
   *  underlying narration + branch UI to avoid overlap. */
  onActiveChange?: (active: boolean) => void;
  /** External request to open a SEEDED conversation (from the choice-area
   *  "ask" chips). When `key` changes, the layer opens `characterId` and
   *  immediately sends `question` as a normal hero turn. */
  askRequest?: {
    characterId: SpeakerId;
    question: string;
    key: number;
    /** Optional unlock for this seeded ask — judged across the conversation. */
    unlock?: { keyword: string; goal: string };
  } | null;
  /** Fired once the current `askRequest` has been claimed, so the caller can
   *  clear it. Without this the request is write-only and a later
   *  unmount→remount (encounter / outcome bridge) re-opens the stale ask's
   *  character over the NEW scene. */
  onAskConsumed?: () => void;
  /** Fired once when, during an unlock ask's conversation, the LLM judges the
   *  goal met — the caller adds `keyword` to PlayState.unlockedKeywords. */
  onKeywordUnlocked?: (keyword: string) => void;
}

const IMAGE_EXTS = [".webp", ".png", ".jpeg", ".jpg"];

/**
 * Dialogue affordances + bubble. The characters the author opted into THIS
 * scene (the dialogue-able scene speaker + the scene's Interactive Characters)
 * are pinned as portrait chips down the left edge of the screen — party
 * companions are NOT auto-included. Tap a portrait → a speech bubble blooms to
 * its right. Only one active at a time.
 */
export function SceneDialogueLayer({
  storyId,
  sceneId,
  sceneNarration,
  hero,
  voiceVolume,
  companions,
  extraDialogueCharacters,
  characters,
  portraitBase,
  portraitFallbackBase,
  mood,
  hasGifted,
  heroMemory,
  journeyNote,
  branches,
  onTakeBranch,
  history,
  onApplyTurn,
  onSessionClose,
  onActiveChange,
  askRequest,
  onAskConsumed,
  onKeywordUnlocked,
}: Props) {
  void storyId;
  const [active, setActive] = useState<SpeakerId | null>(null);
  const [latestReply, setLatestReply] = useState<{
    reply: string;
    action: string | null;
    suggestions: string[];
    itemGift?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  // Bumps each time a reply lands → re-keys SpeechAudio so the same character
  // speaking again (even with identical text) replays the voice line.
  const [speakNonce, setSpeakNonce] = useState(0);
  // Choices are held back until the reply has finished streaming PLUS a short
  // beat — otherwise the buttons pop in over a half-typed bubble.
  const [choicesReady, setChoicesReady] = useState(false);
  const choiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending auto-close (when the LLM ends the conversation). Stored so it can
  // be cancelled if the player closes / starts a new turn first — otherwise it
  // fires later and closes a fresh session.
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedRef = useRef<SpeakerId | null>(null);
  const handledAskKeyRef = useRef<number | null>(null);
  // The active seeded-ask unlock (kept across turns — `askRequest` is consumed
  // after one turn) + a fire-once latch so the keyword unlocks at most once.
  const sessionGoalRef = useRef<{ keyword: string; goal: string } | null>(null);
  const goalFiredRef = useRef(false);

  /** ~0.7s breathing room between the reply landing and the choices. */
  const CHOICE_REVEAL_DELAY_MS = 700;
  function clearChoiceTimer() {
    if (choiceTimerRef.current) {
      clearTimeout(choiceTimerRef.current);
      choiceTimerRef.current = null;
    }
  }
  function clearEndTimer() {
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }
  function handleReplyTyped() {
    clearChoiceTimer();
    choiceTimerRef.current = setTimeout(
      () => setChoicesReady(true),
      CHOICE_REVEAL_DELAY_MS,
    );
  }
  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      clearChoiceTimer();
      clearEndTimer();
    },
    [],
  );

  const characterMap = useMemo(() => {
    const m: Record<string, (typeof characters.characters)[number]> = {};
    for (const c of characters.characters) m[c.id] = c;
    return m;
  }, [characters]);

  /** Dialogue-able characters on THIS scene — ONLY what the author opted in,
   *  NOT the whole party:
   *  ONLY the characters the author set as Interactive on the scene
   *  (`dialogueCharacters` → `extraDialogueCharacters`). NEITHER the party
   *  companions NOR the scene speaker are auto-included — a scene with no
   *  Interactive Character set shows an empty rail. To make the speaker (an NPC
   *  like the Wizard) or a companion talkable on a scene, add them as an
   *  Interactive Character in the admin. */
  const railIds = useMemo<SpeakerId[]>(() => {
    const ids = new Set<SpeakerId>();
    // Availability is derived from persona presence (single source of
    // truth), so a character with no persona never shows a dead button.
    for (const id of extraDialogueCharacters) {
      if (canTalkTo(characterMap[id])) ids.add(id);
    }
    // A seeded "ask" can target a persona character not otherwise on the
    // rail. Surface the active character while talking so the reply bubble
    // (gated on rail membership) anchors, and the player sees who answers.
    if (active && canTalkTo(characterMap[active])) ids.add(active);
    return Array.from(ids);
  }, [extraDialogueCharacters, characterMap, active]);

  const activeRailIdx = useMemo(
    () => (active ? railIds.indexOf(active) : -1),
    [railIds, active],
  );

  // Kick off a first-turn greeting whenever a new character is activated.
  useEffect(() => {
    if (!active) return;
    if (sessionStartedRef.current === active) return;
    sessionStartedRef.current = active;
    void sendTurn(active, "", { isFirstTurn: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot per active change
  }, [active]);

  // Seeded "ask" open (from the choice-area chips): open the named character
  // and send the question as the opening turn. Pre-mark sessionStartedRef so
  // the greeting effect above doesn't also fire for this character.
  useEffect(() => {
    if (!askRequest) return;
    if (handledAskKeyRef.current === askRequest.key) return;
    handledAskKeyRef.current = askRequest.key;
    // Claim it immediately so the parent clears `askRequest`. If we left it set,
    // a later unmount→remount (encounter / outcome bridge) would re-open this
    // ask's character over the NEXT scene.
    onAskConsumed?.();
    const { characterId, question } = askRequest;
    // (Asks may target an off-rail persona character by design — railIds line
    // surfaces them while talking — so we gate only on persona presence.)
    if (!canTalkTo(characterMap[characterId])) return;
    if (active && active !== characterId) closeSession();
    // Arm the unlock for the WHOLE session (sent on every turn; askRequest is
    // cleared after one turn so we can't read it later). Reset the latch.
    sessionGoalRef.current = askRequest.unlock ?? null;
    goalFiredRef.current = false;
    sessionStartedRef.current = characterId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the seeded conversation in response to an external request
    setActive(characterId);
    setLatestReply(null);
    void sendTurn(characterId, question, { isFirstTurn: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per askRequest.key
  }, [askRequest?.key]);

  useEffect(() => {
    onActiveChange?.(active !== null);
  }, [active, onActiveChange]);

  // Clear the parent's "dialogue active" flag on unmount. Taking a branch with
  // an `outcome` (or one that starts an encounter) flips `showingOutcome` /
  // `pendingEncounter` in the same click that closes the session, which
  // unmounts this layer BEFORE the active-sync effect above can fire `false`.
  // Without this, `dialogueActive` sticks `true` and the parent hides the
  // outcome narration + bottom UI. Deps are the stable setter only, so this
  // runs exactly on unmount (no per-turn flicker).
  useEffect(() => {
    return () => onActiveChange?.(false);
  }, [onActiveChange]);

  /** Abort the in-flight dialogue fetch (close, character switch). */
  const abortRef = useRef<AbortController | null>(null);

  async function sendTurn(
    characterId: SpeakerId,
    heroText: string,
    opts: { isFirstTurn?: boolean } = {},
  ) {
    // Cancel any previous in-flight request so a fast double-tap doesn't
    // race two characters' replies.
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setLoading(true);
    setLatestReply(null);
    // New turn → hide the choices until this reply finishes streaming, and
    // cancel any pending auto-close from a previous "endsConversation" turn.
    clearChoiceTimer();
    clearEndTimer();
    setChoicesReady(false);
    try {
      const res = await fetch("/api/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          storyId,
          characterId,
          hero,
          sceneId,
          sceneNarration,
          companions,
          currentMood: mood(characterId),
          history: history(characterId),
          utterance: heroText,
          isFirstTurn: !!opts.isFirstTurn,
          alreadyGifted: hasGifted(characterId),
          heroMemory,
          journeyNote,
          // Re-sent every turn for the whole seeded-ask session (the goal must
          // persist across turns). Undefined for normal chat.
          unlockGoal: sessionGoalRef.current?.goal,
        }),
      });
      if (!res.ok) throw new Error(`dialogue ${res.status}`);
      const data = (await res.json()) as DialogueResponse;
      setLatestReply({
        reply: data.reply,
        action: data.action ?? null,
        suggestions: data.suggestions ?? [],
        itemGift: data.itemGift,
      });
      setSpeakNonce((n) => n + 1);
      onApplyTurn(characterId, data, opts.isFirstTurn ? "" : heroText);
      // Goal met → unlock the ask's keyword exactly once (mood/history already
      // folded in above; the keyword is a separate state field).
      if (data.goalMet && sessionGoalRef.current && !goalFiredRef.current) {
        goalFiredRef.current = true;
        onKeywordUnlocked?.(sessionGoalRef.current.keyword);
      }
      if (data.endsConversation) {
        clearEndTimer();
        endTimerRef.current = setTimeout(() => closeSession(), 2400);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      console.warn("[dialogue]", err);
    } finally {
      // Only clear loading if THIS request is still the current one. A
      // superseded (aborted) request must not turn off the spinner that
      // the newer in-flight request just turned on.
      if (abortRef.current === abort) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  function closeSession() {
    // Abort any pending dialogue stream so it stops writing into the
    // closed bubble (and stops costing tokens on the server).
    abortRef.current?.abort();
    abortRef.current = null;
    clearChoiceTimer();
    clearEndTimer();
    setChoicesReady(false);
    if (active) {
      onSessionClose(active);
      sessionStartedRef.current = null;
    }
    // Drop any armed unlock so a later normal chat carries no stale goal.
    sessionGoalRef.current = null;
    goalFiredRef.current = false;
    setActive(null);
    setLatestReply(null);
    // Clear the parent's flag in THIS commit rather than waiting for the
    // active-sync effect — otherwise a dialogue-driven branch advance renders
    // the new scene for one frame with the bottom UI hidden + narration
    // unmounted (dialogueActive still true).
    onActiveChange?.(false);
  }

  function characterColor(id: SpeakerId): string {
    return characterMap[id]?.color ?? "#5a4128";
  }
  function characterName(id: SpeakerId): string {
    return characterMap[id]?.name ?? id;
  }

  /** Rail layout — kept in sync with the portrait button dimensions
   *  (h-14 ⇒ 56px) and the `gap-5` (20px) between entries. */
  const RAIL_LEFT_PX = 16;
  const RAIL_TOP_PX = 30;
  const RAIL_GAP_PX = 76;

  return (
    <>
      {/* Left-edge portrait rail. Always visible — tap to open / switch.
          Each entry shows a small "Tap to Speak" label above the portrait
          while no dialogue is active; the label hides once a bubble opens. */}
      <div
        className="pointer-events-none fixed z-[55] flex flex-col gap-5"
        style={{ left: `${RAIL_LEFT_PX}px`, top: `${RAIL_TOP_PX}px` }}
      >
        {railIds.map((id, idx) => {
          const isActive = active === id;
          /** "← Tap to speak" hint sits to the RIGHT of the very first
           *  portrait whenever no dialogue is active. Keeps the rail
           *  itself clean while still signposting that the portraits
           *  are interactive. */
          const showHint = !active && idx === 0;
          return (
            <div key={`rail-${id}`} className="relative">
              {showHint && (
                <motion.span
                  className="pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap text-sm font-semibold text-paper"
                  style={{
                    textShadow:
                      "0 2px 6px rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.95)",
                  }}
                  // Gentle nudge — the arrow "tugs" rightward then settles,
                  // opacity breathes slightly so the eye lands on it without
                  // it being noisy. translateY(-50%) stays in inline style.
                  animate={{
                    x: [0, 6, 0],
                    opacity: [0.85, 1, 0.85],
                  }}
                  transition={{
                    duration: 1.8,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                  aria-hidden
                >
                  ← Tap to speak
                </motion.span>
              )}
              <button
                type="button"
                // While a dialogue is open the whole rail is inert: tapping a
                // portrait would otherwise close (self) or abruptly switch
                // (other) the conversation — an easy mis-tap that ends or
                // disrupts the chat. Close via "End conversation" / a branch
                // instead, then the rail re-activates.
                disabled={active !== null}
                onClick={() => {
                  if (active !== null) return;
                  setActive(id);
                  setLatestReply(null);
                }}
                aria-label={`Talk to ${characterName(id)}`}
                title={`Talk to ${characterName(id)}`}
                className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-pill bg-paper/55 backdrop-blur-sm transition-all ${
                  active !== null
                    ? `pointer-events-none ${isActive ? "scale-110" : "opacity-50"}`
                    : "pointer-events-auto hover:scale-105"
                }`}
                style={{
                  // Strong, visible border — characterColor outer ring +
                  // soft paper halo so it reads cleanly over busy art.
                  boxShadow: isActive
                    ? `0 0 0 3px var(--color-accent-deep, #7a4f0e), 0 0 0 6px rgba(255,250,240,0.7), 0 6px 14px rgba(0,0,0,0.28)`
                    : `0 0 0 3px ${characterColor(id)}, 0 0 0 6px rgba(255,250,240,0.7), 0 4px 12px rgba(0,0,0,0.25)`,
                }}
              >
                <PortraitImg
                  base={portraitBase(id)}
                  fallbackBase={portraitFallbackBase?.(id)}
                  alt={characterName(id)}
                  color={characterColor(id)}
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Speak the character's reply via ElevenLabs (Web Audio, mixes with
          BGM). No R2 cache — dialogue is LLM-generated fresh each turn. The
          nonce-keyed playKey replays even when the same line recurs. */}
      {active && latestReply?.reply && characterMap[active]?.voice && (
        <SpeechAudio
          text={latestReply.reply}
          voiceId={characterMap[active].voice}
          voiceSpeed={characterMap[active].voiceSpeed}
          volume={voiceVolume}
          playKey={`${active}:${speakNonce}`}
          cache={false}
        />
      )}

      {/* Active dialogue bubble — always rail-positioned (right of the
          tapped portrait). */}
      <AnimatePresence>
        {active && activeRailIdx >= 0 && (
          <DialogueBubble
            key={`bubble-rail-${active}`}
            railTopPx={RAIL_TOP_PX + activeRailIdx * RAIL_GAP_PX}
            characterName={characterName(active)}
            characterColor={characterColor(active)}
            reply={latestReply?.reply ?? ""}
            action={latestReply?.action ?? null}
            loading={loading || !latestReply}
            onTypingDone={handleReplyTyped}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && latestReply && choicesReady && (
          <DialogueChoiceCards
            key={`choices-${active}`}
            suggestions={latestReply.suggestions}
            branches={branches}
            loading={loading}
            iconBase={portraitBase(active)}
            iconFallbackBase={portraitFallbackBase?.(active)}
            onSend={(t) => sendTurn(active, t)}
            onTakeBranch={(b) => {
              // Navigate FIRST (commitBranch's direct setState), THEN close
              // (onSessionClose's functional setState folds the dialogue count
              // in on top) — the reverse order would clobber the count.
              onTakeBranch(b);
              closeSession();
            }}
            onEnd={closeSession}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Small portrait with extension fallback. Falls back to a color disc
 * when no image is found — keeps the rail visually consistent even
 * before dialogue/ portraits exist for every character.
 */
function PortraitImg({
  base,
  fallbackBase,
  alt,
  color,
}: {
  base: string;
  /** Tried (own extension chain) after `base` 404s — the in-scene sprite, so
   *  characters without a dedicated dialogue head-shot still show. */
  fallbackBase?: string;
  alt: string;
  color: string;
}) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const list = useMemo(
    () => [
      ...IMAGE_EXTS.map((e) => base + e),
      ...(fallbackBase ? IMAGE_EXTS.map((e) => fallbackBase + e) : []),
    ],
    [base, fallbackBase],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on path change
    setIdx(0);
    setFailed(false);
  }, [base, fallbackBase]);

  if (failed) {
    return (
      <span
        className="block h-full w-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- extension fallback
    <img
      src={assetUrl(list[idx])}
      alt={alt}
      draggable={false}
      className="block h-full w-full object-cover"
      onError={() => {
        if (idx + 1 < list.length) setIdx(idx + 1);
        else setFailed(true);
      }}
    />
  );
}
