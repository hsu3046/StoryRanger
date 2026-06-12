"use client";

import type { Howl } from "howler";
import { motion } from "framer-motion";

import type { SpeechAlignment } from "@/lib/tts-config";
import { ReadAlongText } from "../play/ReadAlongText";

interface Props {
  /** Vertical offset (in px) — bubble sits to the right of the portrait
   *  at the same y so the tail points back at it. */
  railTopPx: number;
  characterName: string;
  characterColor: string;
  /** Latest reply text shown inside the bubble. */
  reply: string;
  /** Optional italic action / body language line above the reply. */
  action?: string | null;
  /** Hero is waiting for an LLM response (show typing dots). */
  loading?: boolean;
  /** Fires once the reply is on screen (read-along mounts it whole, so this
   *  is immediate) — the layer uses it to release the choice cards. */
  onTypingDone?: () => void;
  /** Read-along playback for THIS reply (from the layer's SpeechAudio). */
  playbackSound?: Howl | null;
  alignment?: SpeechAlignment | null;
  /** Reply audio is expected (voice on + a TTS mount for this reply). */
  expectAudio?: boolean;
  /** Reply audio settled (finished or will never play). */
  audioDone?: boolean;
}

/**
 * Speech bubble pinned to the right side of the dialogue rail. No tail —
 * the bubble simply slides in next to the portrait. Background runs at
 * ~90% opacity so the scene art reads through. The reply renders whole and
 * read-along-highlights with the character's voice (same mechanism as the
 * scene narration; LLM lines carry their timing in the /api/tts envelope).
 */
export function DialogueBubble({
  railTopPx,
  characterName,
  characterColor,
  reply,
  action,
  loading,
  onTypingDone,
  playbackSound = null,
  alignment = null,
  expectAudio = false,
  audioDone,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ type: "spring", stiffness: 280, damping: 22 }}
      className="pointer-events-auto fixed z-[60]"
      style={{ left: "92px", top: `${railTopPx}px` }}
    >
      <div className="relative max-w-[min(72vw,460px)] min-w-[240px] rounded-card-lg bg-paper/90 px-5 py-4 shadow-card ring-1 ring-ink-soft/15 backdrop-blur">
        <div className="mb-2">
          <span
            className="rounded-pill px-2.5 py-1 text-sm font-semibold"
            style={{
              backgroundColor: characterColor + "22",
              color: characterColor,
            }}
          >
            {characterName}
          </span>
        </div>

        {/* Hide the previous turn's italic action while we're generating
            the next reply — the "…" thinking dots should be the only
            content so it's obvious a new response is on the way. */}
        {action && !loading && (
          <p className="mb-1.5 text-sm italic leading-snug text-ink-soft/80">
            {action}
          </p>
        )}

        <p className="text-base leading-snug text-ink">
          {loading ? (
            <span className="inline-flex gap-0.5" aria-label="thinking">
              <span className="animate-bounce">·</span>
              <span className="animate-bounce [animation-delay:120ms]">·</span>
              <span className="animate-bounce [animation-delay:240ms]">·</span>
            </span>
          ) : (
            <ReadAlongText
              text={reply}
              sound={playbackSound}
              alignment={alignment}
              expectAudio={expectAudio}
              audioDone={audioDone}
              onDone={onTypingDone}
            />
          )}
        </p>
      </div>
    </motion.div>
  );
}
