"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowCircleRight,
  HandWaving,
  PaperPlaneTilt,
  PencilSimple,
} from "@phosphor-icons/react";
import type { Branch } from "@/types/story";
import { assetUrl } from "@/lib/asset-paths";
import { DEFAULT_TTS_VOICE } from "@/lib/tts-config";
import { useChoiceReader } from "@/lib/useChoiceReader";
import {
  choiceButtonClass,
  choiceButtonAccentClass,
  choiceStateClass,
  TapAgainBadge,
} from "../play/ChoiceButton";
import { MicButton } from "../voice/MicButton";

/** Up to this many scene branches sit alongside the LLM reply suggestions
 *  (2 suggestions + 2 branches = the 4-up choice row's ceiling). */
const MAX_DIALOGUE_BRANCHES = 2;
/** LLM reply suggestions shown in-dialogue. The route already trims to 2;
 *  we re-cap defensively so the row never exceeds 4 tiles. */
const MAX_DIALOGUE_SUGGESTIONS = 2;

interface Props {
  /** Short suggested replies from the LLM (the route returns 2). */
  suggestions: string[];
  /** Current scene branches — shown as "advance the story" choices so the
   *  player can move on mid-conversation without ending it first. */
  branches: Branch[];
  /** Send a hero utterance — picked card or typed text. */
  onSend: (text: string) => void;
  /** Take a branch directly from the dialogue (advances to the next scene;
   *  the caller closes the conversation). */
  onTakeBranch: (branch: Branch) => void;
  /** Hero can also end the conversation at any time. */
  onEnd: () => void;
  /** Show typing input on init (collapsed by default to keep UI calm). */
  loading?: boolean;
  /** Portrait asset base (+ sprite fallback) of the dialogue partner — shown
   *  pinned on each reply card, mirroring the Ask chip portrait so the player
   *  sees who they're talking to. */
  iconBase?: string;
  iconFallbackBase?: string;
  /** Voice channel volume (0–1). Drives the tap-to-hear read-aloud + the
   *  two-step tap; 0 degrades both to the classic single-tap select. */
  voiceVolume?: number;
}

const MAX_INPUT = 240;

/**
 * Reply chooser pinned to the bottom of the scene while a dialogue is
 * active. Action buttons (Type your own / End conversation) sit ABOVE
 * the three suggestion cards.
 */
export function DialogueChoiceCards({
  suggestions,
  branches,
  onSend,
  onTakeBranch,
  onEnd,
  loading,
  iconBase,
  iconFallbackBase,
  voiceVolume = 0,
}: Props) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");

  // Voice layer for pre-readers — labels in the EXACT render order below
  // (suggestions, then branches). No auto-read (`autoKey: null`): the NPC
  // just spoke, piling 2 more lines on every turn would drag the pace —
  // tap-to-hear only. `cache: false` because suggestions are LLM one-shots.
  const cappedSuggestions = suggestions.slice(0, MAX_DIALOGUE_SUGGESTIONS);
  const cappedBranches = branches.slice(0, MAX_DIALOGUE_BRANCHES);
  // Content keys -- the capped arrays are NEW identities every render, so the
  // memo keys off their content instead (simple deps keep the linter happy).
  const suggestionsKey = cappedSuggestions.join(" ");
  const branchesKey = cappedBranches.map((b) => b.label).join(" ");
  const voiceLabels = useMemo(
    () => [...cappedSuggestions, ...cappedBranches.map((b) => b.label)],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- content-keyed via the joins above
    [suggestionsKey, branchesKey],
  );

  function confirmVoiceChoice(index: number) {
    if (index < cappedSuggestions.length) {
      const s = cappedSuggestions[index];
      if (s) onSend(s);
      return;
    }
    const b = cappedBranches[index - cappedSuggestions.length];
    if (b) {
      onTakeBranch(b);
    }
  }

  const reader = useChoiceReader({
    labels: voiceLabels,
    // Suggestions are the HERO's lines — the neutral storyteller voice, not
    // the dialogue partner's.
    voiceId: DEFAULT_TTS_VOICE,
    voiceSpeed: 1,
    volume: voiceVolume,
    enabled: false, // no auto sequence in dialogue
    autoKey: null,
    cache: false,
    onConfirm: confirmVoiceChoice,
  });

  function submitTyped() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
    setTyping(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !composing) {
      e.preventDefault();
      submitTyped();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 240, damping: 24 }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[60] flex flex-col gap-3 px-4 pb-4 sm:px-6 sm:pb-6"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {typing ? (
        <>
          {/* Cancel sits ABOVE the input, centered. */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setTyping(false);
                setText("");
              }}
              className="rounded-pill bg-paper-deep/80 px-4 py-1.5 text-sm text-ink-soft shadow-soft ring-1 ring-ink-soft/15 backdrop-blur hover:bg-paper-deep"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-pill bg-paper/90 pl-5 pr-2 py-2 shadow-card ring-1 ring-ink-soft/15 backdrop-blur">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={onKeyDown}
              placeholder="Type your own…"
              disabled={loading}
              className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-soft/60"
            />
            <button
              type="button"
              onClick={submitTyped}
              disabled={loading || !text.trim()}
              aria-label="Send"
              data-sfx="free-input-send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-accent-deep text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <PaperPlaneTilt size={16} weight="fill" />
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Action buttons sit ABOVE the suggestion cards. "End conversation"
              is always available so the player can leave a chat at any time
              (it returns to the current scene without advancing the story). */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setTyping(true)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-pill bg-paper-deep/70 px-4 py-2 text-sm text-ink-soft shadow-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep disabled:opacity-50"
            >
              <PencilSimple size={14} />
              Type your own
            </button>
            <button
              type="button"
              onClick={onEnd}
              className="inline-flex items-center gap-1.5 rounded-pill bg-paper-deep/70 px-4 py-2 text-sm text-ink-soft shadow-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep"
            >
              <HandWaving size={14} />
              End conversation
            </button>
            {/* Say a reply instead of tapping one — renders nothing when
                voice capture is unavailable. KNOWN LIMITATION: the NPC's
                reply voice (SpeechAudio in SceneDialogueLayer) has no
                external stop API, so recording while it still speaks relies
                on getUserMedia's echoCancellation to keep it out of the mic
                — unlike the scene row, which waits for the narrator. */}
            <MicButton
              labels={voiceLabels}
              onMatch={confirmVoiceChoice}
              onRecordingStart={() => reader.stopAll()}
              disabled={loading}
              size="compact"
            />
          </div>
          {/* Reply suggestions (continue talking) + scene branches (advance
              the story) share one left-right row — same layout as the main
              choice row. Branches carry an accent ring + "→" so they read as
              "move on", not "keep chatting". */}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:gap-3">
            {cappedSuggestions.map((s, i) => (
              <div key={`s-${i}-${s}`} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={loading}
                  // Two-step via the reader: first tap reads the reply aloud
                  // + arms, second tap sends it (single-tap when muted).
                  onClick={() => reader.tap(i)}
                  className={
                    choiceButtonClass +
                    choiceStateClass(
                      reader.readingIndex === i,
                      reader.armedIndex === i,
                    )
                  }
                >
                  {reader.armedIndex === i && <TapAgainBadge />}
                  {/* Text centers within the space LEFT of the avatar (flex-1),
                      not the whole button — so the portrait doesn't overlap /
                      clip a long label while a wide gap sits empty on the left. */}
                  <span className="min-w-0 flex-1 text-center">{s}</span>
                  {iconBase && (
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-paper-deep/40 ring-2 ring-paper/70 shadow-sm">
                      <DialogueAvatar
                        base={iconBase}
                        fallbackBase={iconFallbackBase}
                        alt=""
                      />
                    </span>
                  )}
                </button>
              </div>
            ))}
            {cappedBranches.map((b, i) => {
              const idx = cappedSuggestions.length + i;
              return (
                <div key={`b-${b.id}`} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => reader.tap(idx)}
                    className={
                      choiceButtonAccentClass +
                      choiceStateClass(
                        reader.readingIndex === idx,
                        reader.armedIndex === idx,
                      )
                    }
                  >
                    {reader.armedIndex === idx && <TapAgainBadge />}
                    <ArrowCircleRight
                      size={22}
                      weight="fill"
                      className="shrink-0 text-accent-deep"
                      aria-hidden
                    />
                    <span>{b.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}

const AVATAR_EXTS = [".webp", ".png", ".jpeg", ".jpg"];

/** Tiny partner portrait for a reply card — tries each extension of `base`,
 *  then of `fallbackBase` (the in-scene sprite). Mirrors the Ask chip avatar. */
function DialogueAvatar({
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
      ...AVATAR_EXTS.map((e) => base + e),
      ...(fallbackBase ? AVATAR_EXTS.map((e) => fallbackBase + e) : []),
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
