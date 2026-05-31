"use client";

import { useState, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import {
  ArrowCircleRight,
  HandWaving,
  PaperPlaneTilt,
  PencilSimple,
} from "@phosphor-icons/react";
import type { Branch } from "@/types/story";
import { choiceButtonClass, choiceButtonAccentClass } from "../play/ChoiceButton";

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
}: Props) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");

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
              is normally unnecessary — a branch choice always advances and
              closes the chat — so it only appears as a fallback exit on
              scenes with no branches (e.g. endings). */}
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
            {branches.length === 0 && (
              <button
                type="button"
                onClick={onEnd}
                className="inline-flex items-center gap-1.5 rounded-pill bg-paper-deep/70 px-4 py-2 text-sm text-ink-soft shadow-soft ring-1 ring-ink-soft/10 transition-colors hover:bg-paper-deep"
              >
                <HandWaving size={14} />
                End conversation
              </button>
            )}
          </div>
          {/* Reply suggestions (continue talking) + scene branches (advance
              the story) share one left-right row — same layout as the main
              choice row. Branches carry an accent ring + "→" so they read as
              "move on", not "keep chatting". */}
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:gap-3">
            {suggestions.slice(0, MAX_DIALOGUE_SUGGESTIONS).map((s, i) => (
              <div key={`s-${i}-${s}`} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onSend(s)}
                  className={choiceButtonClass}
                >
                  <span>{s}</span>
                </button>
              </div>
            ))}
            {branches.slice(0, MAX_DIALOGUE_BRANCHES).map((b) => (
              <div key={`b-${b.id}`} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onTakeBranch(b)}
                  className={choiceButtonAccentClass}
                >
                  <ArrowCircleRight
                    size={22}
                    weight="fill"
                    className="shrink-0 text-accent-deep"
                    aria-hidden
                  />
                  <span>{b.label}</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
