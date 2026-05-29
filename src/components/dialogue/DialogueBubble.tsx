"use client";

import { motion } from "framer-motion";

import { Typewriter } from "../play/Typewriter";

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
  /** Fires once the reply has finished streaming (or was tap-skipped) — the
   *  layer uses it to hold the choice cards back until the bubble lands. */
  onTypingDone?: () => void;
}

/**
 * Speech bubble pinned to the right side of the dialogue rail. No tail —
 * the bubble simply slides in next to the portrait. Background runs at
 * ~90% opacity so the scene art reads through.
 */
export function DialogueBubble({
  railTopPx,
  characterName,
  characterColor,
  reply,
  action,
  loading,
  onTypingDone,
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
            // Fast typewriter — gives the bubble a "live" feel without
            // the per-character drag of the narration pacing. Tap to skip
            // straight to the full reply.
            <Typewriter
              text={reply}
              speed={14}
              skipOnClick
              onDone={onTypingDone}
            />
          )}
        </p>
      </div>
    </motion.div>
  );
}
